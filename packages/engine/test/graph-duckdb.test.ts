import { assert, describe, layer } from "@effect/vitest";
import {
  AddEntity,
  AddRelation,
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
import { Effect, Option, Result } from "effect";
import { DuckDBGraphLayer, DuckDBGraphService } from "../src/graph-duckdb.js";

const entity = (
  id: string,
  lat: number,
  lon: number,
  validTo: Date = new Date("2024-03-01T00:00:00.000Z")
): Entity =>
  Entity.make({
    id: entityId(id),
    identifiers: [],
    kind: "person",
    spatialExtent: { lat, lon },
    temporalExtent: TemporalExtent.make({
      validFrom: new Date("2024-01-01T00:00:00.000Z"),
      validTo,
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

const chain = Effect.gen(function* () {
  const store = yield* DuckDBGraphService;
  yield* store.insert(
    step(AddEntity.make({ entity: entity("a", 10, 20) }), "s1", "ev-1")
  );
  yield* store.insert(
    step(AddEntity.make({ entity: entity("b", 11, 21) }), "s2", "ev-2")
  );
  yield* store.insert(
    step(
      AddEntity.make({
        entity: entity("c", 50, 60, new Date("2024-02-01T00:00:00.000Z")),
      }),
      "s3",
      "ev-3"
    )
  );
  yield* store.insert(
    step(AddRelation.make({ relation: relation("r1", "a", "b") }), "s4", "ev-4")
  );
  yield* store.insert(
    step(AddRelation.make({ relation: relation("r2", "b", "c") }), "s5", "ev-5")
  );
  yield* store.replay;
  return store;
});

describe("duckdb graph store", () => {
  layer(DuckDBGraphLayer)((it) => {
    it.effect("insert requires at least one evidence id (I2)", () =>
      Effect.gen(function* () {
        const store = yield* DuckDBGraphService;
        const full = step(
          AddEntity.make({ entity: entity("x", 0, 0) }),
          "sx",
          "ex"
        );
        const bad = yield* store
          .insert({ ...full, evidenceIds: [] as never })
          .pipe(Effect.result);
        assert.isTrue(Result.isFailure(bad));
      })
    );

    it.effect("log is append-only and replay reproduces state (I3)", () =>
      Effect.gen(function* () {
        const store = yield* chain;
        const log = yield* store.log;
        assert.strictEqual(log.length, 5);
        const state = yield* store.replay;
        assert.strictEqual(state.entities.length, 3);
        assert.strictEqual(state.relations.length, 2);
        const second = yield* store.replay;
        assert.strictEqual(second.entities.length, 3);
      })
    );

    it.effect("queryEntity returns the folded entity with dates revived", () =>
      Effect.gen(function* () {
        const store = yield* chain;
        const found = yield* store.queryEntity(entityId("a"));
        assert.isTrue(Option.isSome(found));
        if (Option.isSome(found)) {
          assert.strictEqual(
            found.value.temporalExtent.validFrom.toISOString(),
            "2024-01-01T00:00:00.000Z"
          );
        }
      })
    );

    it.effect("paths finds a path between two entities", () =>
      Effect.gen(function* () {
        const store = yield* chain;
        const paths = yield* store.paths("a", "c", 5);
        assert.strictEqual(paths.length, 1);
        const [path] = paths;
        assert.isDefined(path);
        assert.deepStrictEqual(path.entityIds, ["a", "b", "c"]);
        assert.deepStrictEqual(path.relationIds, ["r1", "r2"]);
      })
    );

    it.effect("timeline returns hits overlapping the window", () =>
      Effect.gen(function* () {
        const store = yield* chain;
        const hits = yield* store.timeline(
          new Date("2024-02-15T00:00:00.000Z"),
          new Date("2024-02-16T00:00:00.000Z")
        );
        const ids = hits.map((hit) => hit.id).sort();
        assert.deepStrictEqual(ids, ["a", "b"]);
      })
    );

    it.effect("spatial returns hits inside the bounding box", () =>
      Effect.gen(function* () {
        const store = yield* chain;
        const hits = yield* store.spatial({
          maxLat: 30,
          maxLon: 30,
          minLat: 0,
          minLon: 0,
        });
        const ids = hits.map((hit) => hit.id).sort();
        assert.deepStrictEqual(ids, ["a", "b"]);
      })
    );

    it.effect("relatedness returns candidates ranked by distance", () =>
      Effect.gen(function* () {
        const store = yield* chain;
        const results = yield* store.relatedness("a", 5);
        assert.strictEqual(results.length, 2);
        assert.deepStrictEqual(
          results.map((result) => result.entityId),
          ["b", "c"]
        );
        const [first, second] = results;
        assert.isDefined(first);
        assert.isDefined(second);
        assert.strictEqual(first.distance, 1);
        assert.strictEqual(second.distance, 2);
      })
    );
  });
});
