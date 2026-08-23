import type {
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
  MatchRule,
  OfflineCacheMiss,
  PackManifest,
  ProvenanceError,
  RateLimited,
  RelatedEntity,
  RetryExhausted,
  SourceError,
  SourceNotRunnable,
  SourceSpec,
  Step,
  StepOperation,
  TransformError,
  TransformSpec,
  UnknownCatalogEntry,
  ViewStateDocument,
  ViewStateKey,
  ViewStateWriteError,
} from "@viokit/schema";
import {
  CatalogService,
  CorrelateResolverService,
  emptyPackRegistry,
  PackRegistry,
  SourceRuntimeService,
  TransformRunnerService,
  ViewStateStoreService,
} from "@viokit/schema";
import type { Option } from "effect";
import { Context, Effect, Layer } from "effect";
import { CacheLayer } from "./cache.js";
import { CatalogLayer } from "./catalog.js";
import { CorrelateLayer } from "./correlate.js";
import { EgressLayer } from "./egress.js";
import { EvidenceService } from "./evidence.js";
import { EvidenceLayer } from "./evidence-fs.js";
import { DuckDBGraphLayer, DuckDBGraphService } from "./graph-duckdb.js";
import { RateLimiterLayer } from "./rate-limit.js";
import { SecretProviderEnvLayer } from "./secrets.js";
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
      source: SourceSpec
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
      input: EvidenceInput
    ) => Effect.Effect<Evidence, EvidenceWriteError>;
    /** Read a stored artifact back. Absent for an unknown id: a caller
     * following a trail into a gap should see a gap, not an exception. */
    readonly evidence: (
      id: EvidenceId
    ) => Effect.Effect<Option.Option<Evidence>, EvidenceReadError>;
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

      return {
        acquire: (source) =>
          Effect.gen(function* () {
            const input = yield* runtime.run(source);
            return yield* evidenceStore.put(input);
          }),
        catalog: (filter) => catalog.list(filter),
        correlate: (staged, existing, rules) =>
          correlate.resolve(staged, existing, rules),
        describe: (id) => catalog.describe(id),
        evidence: (id) => evidenceStore.get(id),
        ingest: (input) => evidenceStore.put(input),
        insert: (step) => graph.insert(step),
        loadViewState: (key, version) => viewState.load(key, version),
        log: graph.log,
        paths: (from, to, maxDepth) => graph.paths(from, to, maxDepth),
        queryEntity: (id) => graph.queryEntity(id),
        relatedness: (seed, maxDepth) => graph.relatedness(seed, maxDepth),
        replay: graph.replay,
        runCatalogTransform: (transformId, input) =>
          catalog.runTransform(transformId, input),
        runTransform: (spec, source, project, input) =>
          transform.run(spec, source, project, input),
        saveViewState: (document) => viewState.save(document),
        spatial: (bbox) => graph.spatial(bbox),
        timeline: (from, to) => graph.timeline(from, to),
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
