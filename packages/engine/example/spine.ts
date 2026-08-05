/**
 * End-to-end spine proof: source -> evidence -> graph insert -> query by id -> replay.
 *
 * Uses the real HTTP source runtime with an injected (in-memory) transport so the
 * example is deterministic and offline; the `HttpLive` transport is exercised in
 * `packages/sources`. Run with `bun run packages/engine/example/spine.ts`.
 */

import { Engine, EngineLayer } from "@viokit/engine";
import {
  AddEntity,
  CachePolicy,
  Entity,
  entityId,
  NonEmptyEvidenceIds,
  SourceSpec,
  SourceTransportService,
  Step,
  stepId,
  TemporalExtent,
} from "@viokit/schema";
import { Effect, Layer, Option } from "effect";
import { EvidenceBackendMemory } from "../src/evidence-fs.js";

const fakeHttp = Layer.succeed(SourceTransportService, {
  fetch: () =>
    Effect.succeed({
      bytes: new Uint8Array([0x1, 0x2, 0x3, 0x4]),
      contentType: "application/octet-stream",
    }),
});

const spine = Layer.provide(
  EngineLayer,
  Layer.merge(EvidenceBackendMemory, fakeHttp)
);

const source = SourceSpec.make({
  cache: CachePolicy.make({
    maxStaleMs: 60_000,
    mode: "cache-first",
    ttlMs: 60_000,
  }),
  id: "s1",
  transport: "http",
  url: "https://example.com/artefact",
});

const entity = Entity.make({
  id: entityId("e1"),
  identifiers: [],
  kind: "person",
  spatialExtent: { lat: 51.5, lon: -0.12 },
  temporalExtent: TemporalExtent.make({
    validFrom: new Date("2024-01-01T00:00:00.000Z"),
    validTo: new Date("2024-01-01T00:00:00.000Z"),
  }),
});

const program = Effect.gen(function* () {
  const engine = yield* Engine;

  const evidence = yield* engine.acquire(source);
  const step = Step.make({
    evidenceIds: NonEmptyEvidenceIds.make([evidence.id]),
    id: stepId("s1"),
    operation: AddEntity.make({ entity }),
  });
  yield* engine.insert(step);

  const found = yield* engine.queryEntity(entity.id);
  if (Option.isNone(found)) {
    return yield* Effect.fail(new Error("entity not found by id"));
  }

  const state = yield* engine.replay;
  const stateAgain = yield* engine.replay;
  const deterministic =
    state.entities.length === stateAgain.entities.length &&
    state.entities[0]?.id === stateAgain.entities[0]?.id;

  return {
    acquisitionPath: evidence.acquisitionPath._tag,
    entities: state.entities.length,
    evidenceId: evidence.id,
    queried: found.value.id,
    replayDeterministic: deterministic,
  };
});

const result = await Effect.runPromise(Effect.provide(program, spine));
console.log(JSON.stringify(result, null, 2));
