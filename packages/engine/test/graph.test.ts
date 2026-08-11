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

const relStep = (op: Step["operation"], id: string, ev: string): Step =>
  Step.make({
    evidenceIds: NonEmptyEvidenceIds.make([evidenceId(ev)]),
    id: stepId(id),
    operation: op,
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

    it.effect("paths finds a path between two entities", () =>
      Effect.gen(function* () {
        const store = yield* GraphService;
        yield* store.insert(step);
        yield* store.insert(
          relStep(
            AddRelation.make({ relation: relation("r1", "e1", "e2") }),
            "s2",
            "ev-2"
          )
        );
        yield* store.insert(
          relStep(
            AddRelation.make({ relation: relation("r2", "e2", "e3") }),
            "s3",
            "ev-3"
          )
        );
        const paths = yield* store.paths("e1", "e3", 5);
        assert.strictEqual(paths.length, 1);
        const [path] = paths;
        assert.isDefined(path);
        assert.deepStrictEqual(path.entityIds, ["e1", "e2", "e3"]);
        assert.deepStrictEqual(path.relationIds, ["r1", "r2"]);
      })
    );

    it.effect("timeline returns hits overlapping the window", () =>
      Effect.gen(function* () {
        const store = yield* GraphService;
        yield* store.insert(step);
        const hits = yield* store.timeline(
          new Date("2024-01-01T00:00:00.000Z"),
          new Date("2024-01-01T00:00:00.000Z")
        );
        assert.strictEqual(hits.length, 1);
      })
    );

    it.effect("spatial returns hits inside the bounding box", () =>
      Effect.gen(function* () {
        const store = yield* GraphService;
        yield* store.insert(step);
        const hits = yield* store.spatial({
          maxLat: 5,
          maxLon: 5,
          minLat: 0,
          minLon: 0,
        });
        assert.strictEqual(hits.length, 1);
      })
    );

    it.effect("relatedness returns candidates ranked by distance", () =>
      Effect.gen(function* () {
        const store = yield* GraphService;
        yield* store.insert(
          relStep(
            AddRelation.make({ relation: relation("r1", "e1", "e2") }),
            "s2",
            "ev-2"
          )
        );
        yield* store.insert(
          relStep(
            AddRelation.make({ relation: relation("r2", "e2", "e3") }),
            "s3",
            "ev-3"
          )
        );
        const results = yield* store.relatedness("e1", 5);
        assert.deepStrictEqual(
          results.map((result) => result.entityId),
          ["e2", "e3"]
        );
      })
    );
  });
});
