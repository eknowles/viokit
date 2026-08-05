import type {
  EgressDisabledError,
  Entity,
  Evidence,
  EvidenceInput,
  EvidenceWriteError,
  GraphState,
  OfflineCacheMiss,
  ProvenanceError,
  RateLimited,
  RetryExhausted,
  SourceError,
  SourceSpec,
  Step,
} from "@viokit/schema";
import { SourceRuntimeService } from "@viokit/schema";
import type { Option } from "effect";
import { Context, Effect, Layer } from "effect";
import { CacheLayer } from "./cache.js";
import { EgressLayer } from "./egress.js";
import { EvidenceService } from "./evidence.js";
import { EvidenceLayer } from "./evidence-fs.js";
import { GraphLayer, GraphService } from "./graph.js";
import { RateLimiterLayer } from "./rate-limit.js";
import { SourceRuntimeLayer } from "./source-runtime.js";

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
  }
>()("Engine") {}

export const EngineLayer = Layer.effect(
  Engine,
  Effect.gen(function* () {
    const evidence = yield* EvidenceService;
    const graph = yield* GraphService;
    const runtime = yield* SourceRuntimeService;

    return {
      acquire: (source) =>
        Effect.gen(function* () {
          const input = yield* runtime.run(source);
          return yield* evidence.put(input);
        }),
      ingest: (input) => evidence.put(input),
      insert: (step) => graph.insert(step),
      log: graph.log,
      queryEntity: (id) => graph.queryEntity(id),
      replay: graph.replay,
    };
  })
).pipe(
  Layer.provide(EvidenceLayer),
  Layer.provide(GraphLayer),
  Layer.provide(SourceRuntimeLayer),
  Layer.provide(CacheLayer),
  Layer.provide(EgressLayer),
  Layer.provide(RateLimiterLayer)
);
