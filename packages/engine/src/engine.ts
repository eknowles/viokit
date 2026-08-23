import { randomUUID } from "node:crypto";
import type {
  AccessObservation,
  BBox,
  CatalogEntry,
  CatalogEntryDetail,
  CatalogFilter,
  EgressDisabledError,
  Entity,
  Evidence,
  EvidenceId,
  EvidenceInput,
  EvidenceReadError,
  EvidenceWriteError,
  ExtentHit,
  GraphPath,
  GraphState,
  Investigation,
  InvestigationId,
  MatchRule,
  OfflineCacheMiss,
  PackManifest,
  PrincipalId,
  ProvenanceError,
  RateLimited,
  Redaction,
  RedactionGround,
  RedactionWriteError,
  RelatedEntity,
  RetryExhausted,
  SharedArtifact,
  SourceError,
  SourceNotRunnable,
  SourceSpec,
  Step,
  StepOperation,
  TransformError,
  TransformSpec,
  Unauthorized,
  UnknownCatalogEntry,
  UnknownInvestigation,
  ViewStateDocument,
  ViewStateKey,
  ViewStateWriteError,
} from "@viokit/schema";
import {
  CatalogService,
  CorrelateResolverService,
  defaultTransportCapabilities,
  emptyPackRegistry,
  PackRegistry,
  Redaction as RedactionClass,
  RedactionStoreService,
  redactionId,
  SourceRuntimeService,
  TransformRunnerService,
  TransportCapabilities,
  ViewStateStoreService,
} from "@viokit/schema";
import { Context, Effect, Layer, Option } from "effect";
import type { ProbeError } from "./access-probe.js";
import { verifyAccess } from "./access-probe.js";
import { CacheLayer } from "./cache.js";
import { CatalogLayer } from "./catalog.js";
import { CorrelateLayer } from "./correlate.js";
import { EgressLayer } from "./egress.js";
import { EvidenceService } from "./evidence.js";
import { EvidenceLayer } from "./evidence-fs.js";
import type { Bundle } from "./export.js";
import { writeBundle } from "./export.js";
import { DuckDBGraphLayer, DuckDBGraphService } from "./graph-duckdb.js";
import { RateLimiterLayer } from "./rate-limit.js";
import { RedactionStoreLayer, withheldIn } from "./redactions.js";
import { SecretProviderEnvLayer } from "./secrets.js";
import { BundleSignerLayer, BundleSignerService } from "./signing.js";
import { SourceRuntimeLayer } from "./source-runtime.js";
import { TransformRunnerLayer } from "./transform.js";

/**
 * The composition root of the engine pipeline. Exposes the Stage-0 spine
 * (acquire/ingest/insert/log/queryEntity/replay) plus the P2 surfaces:
 * the four graph query methods, the transform runner, and entity correlate.
 * It stays a thin pass-through to the injected services — it does not re-implement
 * orchestrations, so packs decide how to sequence transform → correlate → commit.
 */
export class Engine extends Context.Service<
  Engine,
  {
    readonly acquire: (
      source: SourceSpec,
      by: PrincipalId
    ) => Effect.Effect<
      Evidence,
      | EvidenceWriteError
      | SourceError
      | EgressDisabledError
      | OfflineCacheMiss
      | RateLimited
      | RetryExhausted
      | SourceNotRunnable
    >;
    readonly ingest: (
      input: EvidenceInput,
      by: PrincipalId
    ) => Effect.Effect<Evidence, EvidenceWriteError>;
    /** Read a stored artifact back. Absent for an unknown id: a caller
     * following a trail into a gap should see a gap, not an exception. */
    readonly evidence: (
      id: EvidenceId
    ) => Effect.Effect<Option.Option<Evidence>, EvidenceReadError>;
    /** Assemble a portable, independently verifiable bundle (TDR-010) for the
     * open investigation. Reads only — exporting appends no step and writes no
     * evidence. Scoped by construction: it reads the same log and replay the
     * queries do, and those answer for one investigation (TDR-025). */
    readonly exportBundle: (
      path: string
    ) => Effect.Effect<Bundle, EvidenceReadError>;
    /** The investigation everything else here answers for. */
    readonly currentInvestigation: Effect.Effect<Investigation>;
    /** The investigations a principal may reach — not all of them: listing the
     * names of cases somebody is not party to is itself disclosure (TDR-023). */
    readonly investigations: (
      by: PrincipalId
    ) => Effect.Effect<readonly Investigation[]>;
    readonly createInvestigation: (
      name: string,
      owner: PrincipalId
    ) => Effect.Effect<Investigation>;
    /** Admit a principal to an investigation. Owner only. */
    readonly addMember: (
      id: InvestigationId,
      principal: PrincipalId,
      by: PrincipalId
    ) => Effect.Effect<Investigation, UnknownInvestigation | Unauthorized>;
    /** Answer for a different investigation from here on. */
    readonly openInvestigation: (
      id: InvestigationId,
      by: PrincipalId
    ) => Effect.Effect<Investigation, UnknownInvestigation | Unauthorized>;
    /** Branch an investigation at its current end, to work a hypothesis. */
    readonly forkInvestigation: (
      from: InvestigationId,
      name: string,
      by: PrincipalId
    ) => Effect.Effect<Investigation, UnknownInvestigation | Unauthorized>;
    /** Stop an investigation contributing, without removing a step (I3). */
    readonly discardInvestigation: (
      id: InvestigationId,
      by: PrincipalId
    ) => Effect.Effect<void, UnknownInvestigation | Unauthorized>;
    /** Which artifacts more than one investigation cites — the only operation
     * that looks across cases, named so it cannot be reached by accident. */
    readonly sharedEvidence: Effect.Effect<readonly SharedArtifact[]>;
    /**
     * Withhold an artifact from the open investigation (TDR-024). Appends a
     * record; the artifact and the step log are untouched (I1, I3). What
     * changes is what leaves the machine.
     */
    readonly redact: (
      evidence: EvidenceId,
      ground: RedactionGround,
      reason: string,
      by: PrincipalId
    ) => Effect.Effect<Redaction, RedactionWriteError>;
    /** What is being withheld from the open investigation, and why. */
    readonly redactions: Effect.Effect<
      readonly Redaction[],
      RedactionWriteError
    >;
    readonly insert: (step: Step) => Effect.Effect<Step, ProvenanceError>;
    readonly log: Effect.Effect<readonly Step[]>;
    readonly queryEntity: (id: string) => Effect.Effect<Option.Option<Entity>>;
    readonly replay: Effect.Effect<GraphState>;
    readonly paths: (
      from: string,
      to: string,
      maxDepth?: number
    ) => Effect.Effect<readonly GraphPath[]>;
    readonly timeline: (
      from: Date,
      to: Date
    ) => Effect.Effect<readonly ExtentHit[]>;
    readonly spatial: (bbox: BBox) => Effect.Effect<readonly ExtentHit[]>;
    readonly relatedness: (
      seed: string,
      maxDepth?: number
    ) => Effect.Effect<readonly RelatedEntity[]>;
    readonly runTransform: (
      spec: TransformSpec,
      source: SourceSpec,
      project: (
        evidence: EvidenceInput,
        input: unknown
      ) => readonly StepOperation[],
      input: unknown
    ) => Effect.Effect<readonly Step[], TransformError>;
    readonly correlate: (
      staged: readonly Step[],
      existing: GraphState,
      rules: readonly MatchRule[]
    ) => Effect.Effect<readonly Step[], never>;
    /** What this deployment can do: registered sources, transforms, and
     * ontology types. A read-only projection — it appends no step (I3). */
    readonly catalog: (
      filter?: CatalogFilter
    ) => Effect.Effect<readonly CatalogEntry[]>;
    /** One entry's invocation contract, as JSON Schema where one applies. */
    readonly describe: (
      id: string
    ) => Effect.Effect<CatalogEntryDetail, UnknownCatalogEntry>;
    /** Run a transform by catalog id, with its projection resolved from the
     * pack that registered it — the invocation form that survives a front-end
     * boundary, since a projection callback cannot cross one. */
    readonly runCatalogTransform: (
      transformId: string,
      input: unknown
    ) => Effect.Effect<readonly Step[], UnknownCatalogEntry | TransformError>;
    /** A surface's stored configuration. Absent covers "never saved",
     * "unreadable", and "written under another version" alike — all mean the
     * surface starts from defaults (I12). */
    readonly loadViewState: (
      key: ViewStateKey,
      version: number
    ) => Effect.Effect<Option.Option<ViewStateDocument>>;
    /** Persist a surface's configuration. Appends no step and writes no
     * evidence — view state is never part of the trail (I3, I12). */
    readonly saveViewState: (
      document: ViewStateDocument
    ) => Effect.Effect<void, ViewStateWriteError>;
    /** Check a registered source's access classification against what it
     * actually serves. Reports; never rewrites the source's own value. */
    readonly verifyAccess: (
      sourceId: string
    ) => Effect.Effect<AccessObservation, ProbeError>;
  }
>()("Engine") {}

/**
 * The default pack registry: no packs registered, so the catalog reports only
 * the ontology types registered at runtime. An empty catalog is a valid answer,
 * not an error. A deployment registers its packs by providing its own
 * `PackRegistry` layer in place of this one.
 */
export const DefaultPackRegistryLayer: Layer.Layer<PackRegistry> =
  Layer.succeed(PackRegistry, emptyPackRegistry);

/**
 * Build an engine layer over a given pack registry. The registry is the only
 * way pack content reaches the catalog, so this is how a deployment declares
 * what it can do. Everything else is fixed: the retained DuckDB graph store
 * (TDR-005) and the standard runtime slices.
 *
 * The ontology registry and the view-state store are deployment inputs, not
 * internal slices: packs register types into the registry at runtime, and where
 * view state lives is deployment configuration, so the deployment must hold
 * the same instances the engine reads from.
 */
const engineLayerWith = (registry: Layer.Layer<PackRegistry>) =>
  Layer.effect(
    Engine,
    Effect.gen(function* () {
      const evidenceStore = yield* EvidenceService;
      const graph = yield* DuckDBGraphService;
      const runtime = yield* SourceRuntimeService;
      const transform = yield* TransformRunnerService;
      const correlate = yield* CorrelateResolverService;
      const catalog = yield* CatalogService;
      const viewState = yield* ViewStateStoreService;
      const redactions = yield* RedactionStoreService;
      const signer = yield* BundleSignerService;
      const capabilities = Option.getOrElse(
        yield* Effect.serviceOption(TransportCapabilities),
        () => defaultTransportCapabilities
      );

      return {
        acquire: (source, by) =>
          Effect.gen(function* () {
            const input = yield* runtime.run(source);
            // Custody: an export can already say the bytes are intact since it
            // was written, and this is what lets it say who obtained them.
            return yield* evidenceStore.put({ ...input, acquiredBy: by });
          }),
        addMember: (id, principal, by) => graph.addMember(id, principal, by),
        catalog: (filter) => catalog.list(filter),
        correlate: (staged, existing, rules) =>
          correlate.resolve(staged, existing, rules),
        createInvestigation: (name, owner) =>
          graph.createInvestigation(name, owner),
        currentInvestigation: graph.current,
        describe: (id) => catalog.describe(id),
        discardInvestigation: (id, by) => graph.discardInvestigation(id, by),
        evidence: (id) => evidenceStore.get(id),
        exportBundle: (path) =>
          Effect.gen(function* () {
            const steps = yield* graph.log;
            const state = yield* graph.replay;
            const open = yield* graph.current;
            const withheld = yield* withheldIn(redactions, open.id).pipe(
              Effect.orDie
            );
            return yield* writeBundle({
              at: new Date(),
              evidence: (id) => evidenceStore.get(id),
              graph: state,
              path,
              signer,
              steps,
              withheld,
            });
          }),
        forkInvestigation: (from, name, by) =>
          graph.forkInvestigation(from, name, by),
        // A manual submission carries two different facts: `Manual.by` is the
        // self-asserted claim about who retrieved it, and this is who the
        // deployment authenticated as submitting it.
        ingest: (input, by) => evidenceStore.put({ ...input, acquiredBy: by }),
        insert: (step) => graph.insert(step),
        investigations: (by) => graph.investigations(by),
        loadViewState: (key, version) => viewState.load(key, version),
        log: graph.log,
        openInvestigation: (id, by) => graph.openInvestigation(id, by),
        paths: (from, to, maxDepth) => graph.paths(from, to, maxDepth),
        queryEntity: (id) => graph.queryEntity(id),
        redact: (evidence, ground, reason, by) =>
          Effect.gen(function* () {
            const open = yield* graph.current;
            return yield* redactions.redact(
              RedactionClass.make({
                evidenceId: evidence,
                ground,
                id: redactionId(randomUUID()),
                investigation: open.id,
                reason,
                redactedAt: new Date(),
                redactedBy: by,
              })
            );
          }),
        redactions: Effect.gen(function* () {
          const open = yield* graph.current;
          return yield* redactions.forInvestigation(open.id);
        }),
        relatedness: (seed, maxDepth) => graph.relatedness(seed, maxDepth),
        replay: graph.replay,
        runCatalogTransform: (transformId, input) =>
          catalog.runTransform(transformId, input),
        runTransform: (spec, source, project, input) =>
          transform.run(spec, source, project, input),
        saveViewState: (document) => viewState.save(document),
        sharedEvidence: graph.sharedEvidence,
        spatial: (bbox) => graph.spatial(bbox),
        timeline: (from, to) => graph.timeline(from, to),
        // The probe reads the services this layer already holds, so it is
        // provided them here rather than being a second composition root.
        verifyAccess: (sourceId) =>
          verifyAccess(sourceId).pipe(
            Effect.provideService(CatalogService, catalog),
            Effect.provideService(EvidenceService, evidenceStore),
            Effect.provideService(SourceRuntimeService, runtime),
            Effect.provideService(TransportCapabilities, capabilities)
          ),
      };
    })
  ).pipe(
    Layer.provide(DuckDBGraphLayer),
    Layer.provide(CatalogLayer),
    Layer.provide(registry),
    Layer.provide(TransformRunnerLayer),
    Layer.provide(CorrelateLayer),
    Layer.provide(SourceRuntimeLayer),
    Layer.provide(CacheLayer),
    Layer.provide(EgressLayer),
    Layer.provide(RateLimiterLayer),
    Layer.provide(SecretProviderEnvLayer),
    Layer.provide(RedactionStoreLayer),
    // Provided *to* the signer, not merged beside it: the signer resolves its
    // key through `SecretProvider` from its own construction context, so a
    // sibling layer is invisible to it and every bundle comes out unsigned
    // while claiming a key was configured. The same wiring mistake the browser
    // engine made.
    Layer.provide(Layer.provide(BundleSignerLayer, SecretProviderEnvLayer)),
    Layer.provide(EvidenceLayer)
  );

/**
 * An engine layer with the given packs registered. Pack files that no manifest
 * here names stay invisible to the catalog — registration is explicit.
 */
export const makeEngineLayer = (packs: readonly PackManifest[]) =>
  engineLayerWith(Layer.succeed(PackRegistry, packs));

/** The default engine layer: the retained DuckDB store (TDR-005), no packs. */
export const EngineLayer = engineLayerWith(DefaultPackRegistryLayer);

// The in-memory `GraphLayer` (from ./graph.js) remains exported as a documented
// fallback for fixtures and callers that override the graph store dependency.
