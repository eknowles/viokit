import { assert, describe, layer } from "@effect/vitest";
import {
  AddEntity,
  Entity,
  entityId,
  evidenceId,
  NonEmptyEvidenceIds,
  Step,
  type Step as StepType,
  stepId,
  TemporalExtent,
} from "@viokit/schema";
import { Effect, Option, Result } from "effect";
import { GraphLayer, GraphService } from "../src/graph.js";

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

describe("graph store", () => {
  layer(GraphLayer)((it) => {
    it.effect("insert requires at least one evidence id (I2)", () =>
      Effect.gen(function* () {
        const store = yield* GraphService;
        const bad = yield* store
          .insert({ ...step, evidenceIds: [] } as unknown as StepType)
          .pipe(Effect.result);
        assert.isTrue(Result.isFailure(bad));
      })
    );

    it.effect("log is append-only and replay reproduces state (I3)", () =>
      Effect.gen(function* () {
        const store = yield* GraphService;
        yield* store.insert(step);
        const log = yield* store.log;
        assert.strictEqual(log.length, 1);
        const state = yield* store.replay;
        assert.strictEqual(state.entities.length, 1);
      })
    );

    it.effect("queryEntity returns the folded entity", () =>
      Effect.gen(function* () {
        const store = yield* GraphService;
        yield* store.insert(step);
        const found = yield* store.queryEntity(entity.id);
        assert.isTrue(Option.isSome(found));
      })
    );
  });
});
