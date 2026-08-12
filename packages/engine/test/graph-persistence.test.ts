import { assert, describe, it } from "@effect/vitest";
import {
  AddEntity,
  AddRelation,
  DuckDBConfig,
  Entity,
  entityId,
  evidenceId,
  NonEmptyEvidenceIds,
  Relation,
  relationId,
  Step,
  stepId,
  TemporalExtent,
} from "@viokit/schema";
import { Effect, Layer } from "effect";
import { DuckDBGraphLayer, DuckDBGraphService } from "../src/graph-duckdb.js";

const entity = (id: string): Entity =>
  Entity.make({
    id: entityId(id),
    identifiers: [],
    kind: "person",
    spatialExtent: { lat: 10, lon: 20 },
    temporalExtent: TemporalExtent.make({
      validFrom: new Date("2024-01-01T00:00:00.000Z"),
      validTo: new Date("2024-01-01T00:00:00.000Z"),
    }),
  });

const relation = (id: string, source: string, target: string): Relation =>
  Relation.make({
    id: relationId(id),
    sourceId: entityId(source),
    targetId: entityId(target),
    temporalExtent: TemporalExtent.make({
      validFrom: new Date("2024-01-01T00:00:00.000Z"),
      validTo: new Date("2024-01-01T00:00:00.000Z"),
    }),
    type: "locatedAt",
  });

const step = (op: Step["operation"], id: string, ev: string): Step =>
  Step.make({
    evidenceIds: NonEmptyEvidenceIds.make([evidenceId(ev)]),
    id: stepId(id),
    operation: op,
  });

/** A durable store layer bound to a specific database path. */
const persistedLayer = (path: string) =>
  Layer.provide(DuckDBGraphLayer, Layer.succeed(DuckDBConfig, path));

// A throwaway path per run (test isolates from real investigation files).
const dbPath = `/tmp/viokit-persist-${Date.now()}-${Math.random().toString(36).slice(2)}.duckdb`;

const writeThenDispose = Effect.gen(function* () {
  const store = yield* DuckDBGraphService;
  yield* store.insert(
    step(AddEntity.make({ entity: entity("a") }), "s1", "ev-1")
  );
  yield* store.insert(
    step(AddEntity.make({ entity: entity("b") }), "s2", "ev-2")
  );
  yield* store.insert(
    step(AddRelation.make({ relation: relation("r1", "a", "b") }), "s3", "ev-3")
  );
  yield* store.replay;
  yield* store.dispose;
});

describe("duckdb graph persistence", () => {
  it.effect(
    "insert → dispose → reopen reproduces log, projection and queries (I3/I11)",
    () =>
      Effect.gen(function* () {
        // Phase 1: write to the durable path and close it (process "restart").
        yield* Effect.scoped(
          writeThenDispose.pipe(Effect.provide(persistedLayer(dbPath)))
        );

        // Phase 2: reopen the same path in a fresh store.
        const state = yield* Effect.scoped(
          Effect.gen(function* () {
            const reopened = yield* DuckDBGraphService;
            const first = yield* reopened.replay;
            assert.strictEqual(first.entities.length, 2);
            assert.strictEqual(first.relations.length, 1);
            const related = yield* reopened.relatedness("a", 5);
            assert.strictEqual(related.length, 1);
            assert.strictEqual(related[0]?.entityId, "b");
            assert.strictEqual(related[0]?.distance, 1);
            const log = yield* reopened.log;
            assert.strictEqual(log.length, 3);
            return first;
          }).pipe(Effect.provide(persistedLayer(dbPath)))
        );

        // Deterministic: a second replay reproduces the same state (I3).
        const second = yield* Effect.scoped(
          Effect.gen(function* () {
            const reopened = yield* DuckDBGraphService;
            const stateAfter = yield* reopened.replay;
            yield* reopened.dispose;
            return stateAfter;
          }).pipe(Effect.provide(persistedLayer(dbPath)))
        );
        assert.strictEqual(second.entities.length, state.entities.length);
        assert.strictEqual(second.relations.length, state.relations.length);
      }),
    { timeout: 20_000 }
  );
});
