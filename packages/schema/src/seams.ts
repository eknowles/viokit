import type { Effect, Option } from "effect";
import { Context } from "effect";
import type {
  CatalogEntry,
  CatalogEntryDetail,
  CatalogFilter,
  PackManifest,
  UnknownCatalogEntry,
} from "./runtime-catalog.js";
import type {
  AuthScheme,
  EgressDisabledError,
  Entity,
  Evidence,
  EvidenceId,
  EvidenceInput,
  EvidenceReadError,
  EvidenceWriteError,
  GraphState,
  MatchRule,
  OfflineCacheMiss,
  ProvenanceError,
  RateLimited,
  RetryExhausted,
  SourceError,
  SourceNotRunnable,
  SourceSpec,
  Step,
  StepOperation,
  TransformError,
  TransformSpec,
} from "./schemas.js";

export interface EvidenceStore {
  readonly get: (
    id: EvidenceId
  ) => Effect.Effect<Option.Option<Evidence>, EvidenceReadError>;
  readonly list: Effect.Effect<readonly Evidence[], EvidenceReadError>;
  readonly put: (
    input: EvidenceInput
  ) => Effect.Effect<Evidence, EvidenceWriteError>;
}

/** A path through the graph: an ordered list of entity ids with the relations between them. */
export interface GraphPath {
  readonly entityIds: readonly string[];
  readonly relationIds: readonly string[];
}

/** One hit in a temporal (`timeline`) or spatial (`spatial`) window scan. */
export interface ExtentHit {
  readonly id: string;
  readonly kind: string;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly validFrom: Date;
  readonly validTo: Date;
}

/** A spatial bounding box (WGS84). */
export interface BBox {
  readonly maxLat: number;
  readonly maxLon: number;
  readonly minLat: number;
  readonly minLon: number;
}

/** A `relatedness` result: a candidate entity reached from the seed, ranked by distance. */
export interface RelatedEntity {
  readonly distance: number;
  readonly entityId: string;
  readonly relationType: string | null;
}

export interface GraphStore {
  /**
   * Release the store's backing resources (close the database file). Persisted
   * stores release the path so it can be reopened elsewhere; in-memory stores
   * are no-ops. Safe to call once.
   */
  readonly dispose: Effect.Effect<void>;
  readonly insert: (step: Step) => Effect.Effect<Step, ProvenanceError>;
  readonly log: Effect.Effect<readonly Step[]>;
  /** Shortest paths (depth-bounded) between two entities, via relation edges. */
  readonly paths: (
    from: string,
    to: string,
    maxDepth?: number
  ) => Effect.Effect<readonly GraphPath[]>;
  readonly queryEntity: (id: string) => Effect.Effect<Option.Option<Entity>>;
  /** BFS `relatedness`: entities reachable from the seed, ranked by distance. */
  readonly relatedness: (
    seed: string,
    maxDepth?: number
  ) => Effect.Effect<readonly RelatedEntity[]>;
  readonly replay: Effect.Effect<GraphState>;
  /** Entities/events whose spatial extent falls inside the bounding box. */
  readonly spatial: (bbox: BBox) => Effect.Effect<readonly ExtentHit[]>;
  /** Entities/events whose temporal extent overlaps the window. */
  readonly timeline: (
    from: Date,
    to: Date
  ) => Effect.Effect<readonly ExtentHit[]>;
}

export interface SourceRuntime {
  readonly run: (
    source: SourceSpec
  ) => Effect.Effect<
    EvidenceInput,
    | SourceError
    | EgressDisabledError
    | OfflineCacheMiss
    | RateLimited
    | RetryExhausted
    | SourceNotRunnable
  >;
}

export class SourceRuntimeService extends Context.Service<
  SourceRuntimeService,
  SourceRuntime
>()("SourceRuntimeService") {}

/** Raw bytes a transport produced for a source, before projection. */
export interface TransportResult {
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

/** A transport seam: turns a source into raw response bytes (task 4.5/5.1). */
/**
 * A credential the runtime resolved and the transport applies. The transport
 * receives the value, never the provider — credential handling is runtime
 * policy (I4/I10), and transports are the component a pack is most likely to
 * contribute.
 */
export interface ResolvedCredential {
  readonly name: string | undefined;
  readonly scheme: AuthScheme;
  readonly value: string;
}

export interface SourceTransport {
  readonly fetch: (
    source: SourceSpec,
    credential?: ResolvedCredential
  ) => Effect.Effect<TransportResult, SourceError>;
}

export class SourceTransportService extends Context.Service<
  SourceTransportService,
  SourceTransport
>()("SourceTransportService") {}

/**
 * A transform runner: turns a TransformSpec + input into derived steps. It runs
 * the referenced source through SourceRuntime (I4/I10 — never raw fetch), then
 * projects the response into entity/relation/event operations that are each
 * attributed to the resulting evidence (I2). `project` is the domain projection
 * supplied by the caller/pack (open-domain rule — core holds no domain
 * projections). The steps it returns are staged output the engine commits to
 * the graph.
 */
export interface TransformRunner {
  readonly run: (
    spec: TransformSpec,
    source: SourceSpec,
    project: (
      evidence: EvidenceInput,
      input: unknown
    ) => readonly StepOperation[],
    input: unknown
  ) => Effect.Effect<readonly Step[], TransformError>;
}

export class TransformRunnerService extends Context.Service<
  TransformRunnerService,
  TransformRunner
>()("TransformRunnerService") {}

/**
 * Entity resolution (TDR-015): given staged (uncommitted) steps, the existing
 * graph, and per-kind `MatchRule`s, promote any staged entity that shares a
 * normalized identifier with an existing vertex into a `ResolveEntity` merge
 * step (append-only, I2/I3). Matching is strict: two identifiers are equal iff
 * their canonical forms (per the rule's normalizations) are identical.
 * Fuzzy/confidence scoring is deferred to P4.
 */
export interface CorrelateResolver {
  readonly resolve: (
    staged: readonly Step[],
    existing: GraphState,
    rules: readonly MatchRule[]
  ) => Effect.Effect<readonly Step[], never>;
}

export class CorrelateResolverService extends Context.Service<
  CorrelateResolverService,
  CorrelateResolver
>()("CorrelateResolverService") {}

/**
 * Resolves credential references (TDR-018). Lives behind a seam so the backend
 * — environment, file, and later a keychain — is a swap rather than a rewrite.
 * Only the runtime holds this: transports receive an already-resolved
 * credential, so a pack-contributed transport cannot reach arbitrary secrets
 * (I4/I10).
 */
export interface SecretProvider {
  /** The value for a reference, or `None` when it does not resolve here. */
  readonly get: (secretRef: string) => Effect.Effect<Option.Option<string>>;
}

export class SecretProviderService extends Context.Service<
  SecretProviderService,
  SecretProvider
>()("SecretProviderService") {}

/**
 * The runtime catalog: what this deployment can do. Folded from the pack
 * manifests registered with it plus the ontology registry, so every front-end
 * discovers capability from one place instead of keeping its own registry.
 *
 * `runTransform` takes a catalog id, not a projection callback: the projection
 * is registered in the manifest (see `RegisteredTransform`), which is what lets
 * a transform be invoked across a front-end boundary at all. It returns staged
 * steps — committing them stays a separate, explicit act (I2/I3).
 */
export interface Catalog {
  readonly describe: (
    id: string
  ) => Effect.Effect<CatalogEntryDetail, UnknownCatalogEntry>;
  readonly list: (
    filter?: CatalogFilter
  ) => Effect.Effect<readonly CatalogEntry[]>;
  readonly runTransform: (
    transformId: string,
    input: unknown
  ) => Effect.Effect<readonly Step[], UnknownCatalogEntry | TransformError>;
}

export class CatalogService extends Context.Service<CatalogService, Catalog>()(
  "CatalogService"
) {}

/**
 * The pack manifests a deployment registers. Construction of the catalog fails
 * with `PackRegistrationError` if any manifest carries content that does not
 * decode, so a deployment either has a valid catalog or does not start.
 */
export class PackRegistry extends Context.Service<
  PackRegistry,
  readonly PackManifest[]
>()("PackRegistry") {}

/** The default registry: no packs. An empty catalog is valid, not an error. */
export const emptyPackRegistry: readonly PackManifest[] = [];

/**
 * Config for the DuckDB-backed graph store: the database file path. An empty
 * path (which is also the default when no value is provided) selects an
 * anonymous in-memory DuckDB instance; a non-empty path opens a durable,
 * named database. Kept in the seams so engine layers and callers share one
 * config contract.
 */
export class DuckDBConfig extends Context.Service<DuckDBConfig, string>()(
  "DuckDBConfig"
) {}

/** The default duckdb-graph-persistence choice: in-memory (no persistent file). */
export const defaultDuckDBConfig = "";
