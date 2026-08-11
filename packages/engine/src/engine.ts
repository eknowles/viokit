import type {
  BBox,
  EgressDisabledError,
  Entity,
  Evidence,
  EvidenceInput,
  EvidenceWriteError,
  ExtentHit,
  GraphPath,
  GraphState,
  MatchRule,
  OfflineCacheMiss,
  ProvenanceError,
  RateLimited,
  RelatedEntity,
  RetryExhausted,
  SourceError,
  SourceSpec,
  Step,
  StepOperation,
  TransformError,
  TransformSpec,
} from "@viokit/schema";
import {
  CorrelateResolverService,
  SourceRuntimeService,
  TransformRunnerService,
} from "@viokit/schema";
import type { Option } from "effect";
import { Context, Effect, Layer } from "effect";
import { CacheLayer } from "./cache.js";
import { CorrelateLayer } from "./correlate.js";
import { EgressLayer } from "./egress.js";
import { EvidenceService } from "./evidence.js";
import { EvidenceLayer } from "./evidence-fs.js";
import { DuckDBGraphLayer, DuckDBGraphService } from "./graph-duckdb.js";
import { RateLimiterLayer } from "./rate-limit.js";
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
    >;
    readonly ingest: (
      input: EvidenceInput
    ) => Effect.Effect<Evidence, EvidenceWriteError>;
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
  }
>()("Engine") {}

/** The default engine layer runs on the retained DuckDB graph store (TDR-005). */
export const EngineLayer = Layer.effect(
  Engine,
  Effect.gen(function* () {
    const evidence = yield* EvidenceService;
    const graph = yield* DuckDBGraphService;
    const runtime = yield* SourceRuntimeService;
    const transform = yield* TransformRunnerService;
    const correlate = yield* CorrelateResolverService;

    return {
      acquire: (source) =>
        Effect.gen(function* () {
          const input = yield* runtime.run(source);
          return yield* evidence.put(input);
        }),
      correlate: (staged, existing, rules) =>
        correlate.resolve(staged, existing, rules),
      ingest: (input) => evidence.put(input),
      insert: (step) => graph.insert(step),
      log: graph.log,
      paths: (from, to, maxDepth) => graph.paths(from, to, maxDepth),
      queryEntity: (id) => graph.queryEntity(id),
      relatedness: (seed, maxDepth) => graph.relatedness(seed, maxDepth),
      replay: graph.replay,
      runTransform: (spec, source, project, input) =>
        transform.run(spec, source, project, input),
      spatial: (bbox) => graph.spatial(bbox),
      timeline: (from, to) => graph.timeline(from, to),
    };
  })
).pipe(
  Layer.provide(DuckDBGraphLayer),
  Layer.provide(TransformRunnerLayer),
  Layer.provide(CorrelateLayer),
  Layer.provide(SourceRuntimeLayer),
  Layer.provide(CacheLayer),
  Layer.provide(EgressLayer),
  Layer.provide(RateLimiterLayer),
  Layer.provide(EvidenceLayer)
);

// The in-memory `GraphLayer` (from ./graph.js) remains exported as a documented
// fallback for fixtures and callers that override the graph store dependency.
