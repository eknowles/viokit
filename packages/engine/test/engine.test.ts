import { assert, describe, layer } from "@effect/vitest";
import {
  AddEntity,
  Entity,
  entityId,
  evidenceId,
  Live,
  NonEmptyEvidenceIds,
  SourceSpec,
  SourceTransportService,
  Step,
  stepId,
  TemporalExtent,
} from "@viokit/schema";
import { Effect, Layer, Option } from "effect";
import { Engine, EngineLayer } from "../src/engine.js";
import { EvidenceBackendMemory } from "../src/evidence-fs.js";

const sourceSpec = SourceSpec.make({
  id: "s1",
  transport: "http",
  url: "https://example.com/artefact",
});

const fakeTransport = Layer.succeed(SourceTransportService, {
  fetch: () =>
    Effect.succeed({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/octet-stream",
    }),
});

const entity = Entity.make({
  id: entityId("e1"),
  identifiers: [],
  kind: "person",
  spatialExtent: { lat: 1, lon: 2 },
  temporalExtent: TemporalExtent.make({
    validFrom: new Date("2024-01-01T00:00:00.000Z"),
    validTo: new Date("2024-01-01T00:00:00.000Z"),
  }),
});

const step = Step.make({
  evidenceIds: NonEmptyEvidenceIds.make([evidenceId("ev-1")]),
  id: stepId("s1"),
  operation: AddEntity.make({ entity }),
});

const engineLayer = Layer.provide(
  EngineLayer,
  Layer.merge(fakeTransport, EvidenceBackendMemory)
);

describe("acquire stores evidence with a live acquisition path (I9)", () => {
  layer(engineLayer)((it) => {
    it.effect("", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const evidence = yield* engine.acquire(sourceSpec);
        assert.deepEqual(Array.from(evidence.bytes), [1, 2, 3]);
        assert.strictEqual(evidence.acquisitionPath._tag, "live");
      })
    );
  });
});

describe("ingest accepts external evidence", () => {
  layer(engineLayer)((it) => {
    it.effect("", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const evidence = yield* engine.ingest({
          acquiredAt: new Date("2024-01-01T00:00:00.000Z"),
          acquisitionPath: Live.make({}),
          bytes: new Uint8Array([7, 8]),
          contentType: "application/octet-stream",
          observedAt: new Date("2024-01-01T00:00:00.000Z"),
        });
        assert.strictEqual(evidence.contentType, "application/octet-stream");
      })
    );
  });
});

describe("insert + queryEntity round-trips a step", () => {
  layer(engineLayer)((it) => {
    it.effect("", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        yield* engine.insert(step);
        const found = yield* engine.queryEntity(entity.id);
        assert.isTrue(Option.isSome(found));
      })
    );
  });
});

describe("replay folds the full step log", () => {
  layer(engineLayer)((it) => {
    it.effect("", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        yield* engine.insert(step);
        const log = yield* engine.log;
        assert.strictEqual(log.length, 1);
        const state = yield* engine.replay;
        assert.strictEqual(state.entities.length, 1);
      })
    );
  });
});
