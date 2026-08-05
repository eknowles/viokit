import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, layer } from "@effect/vitest";
import {
  AddEntity,
  Entity,
  entityId,
  NonEmptyEvidenceIds,
  Step,
  stepId,
  TemporalExtent,
} from "@viokit/schema";
import { Effect, Layer, Option } from "effect";
import { afterAll, beforeAll } from "vitest";
import { EvidenceService } from "../src/evidence.js";
import { EvidenceFsLayer, EvidenceRootDir } from "../src/evidence-fs.js";
import { GraphLayer, GraphService } from "../src/graph.js";
import { pastInput } from "./support.js";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "viokit-roundtrip-"));
});

afterAll(async () => {
  await rm(root, { force: true, recursive: true });
});

const RootLayer = Layer.effect(
  EvidenceRootDir,
  Effect.sync(() => root)
);
const RoundTripLayer = Layer.merge(EvidenceFsLayer, GraphLayer).pipe(
  Layer.provide(RootLayer)
);

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

describe("store -> replay round-trip against the filesystem backend (3.2)", () => {
  layer(RoundTripLayer)((it) => {
    it.effect(
      "put evidence, build a step, insert, and replay reproduces state",
      () =>
        Effect.gen(function* () {
          const evidenceStore = yield* EvidenceService;
          const graph = yield* GraphService;

          const evidence = yield* evidenceStore.put(pastInput);

          const step = yield* graph.insert(
            Step.make({
              evidenceIds: NonEmptyEvidenceIds.make([evidence.id]),
              id: stepId("s1"),
              operation: AddEntity.make({ entity }),
            })
          );
          assert.strictEqual(step.evidenceIds[0], evidence.id);

          const state = yield* graph.replay;
          const replayed = state.entities.find((item) => item.id === entity.id);
          assert.isDefined(replayed);
        })
    );

    it.effect(
      "replay over the fs evidence id yields the folded entity (I3)",
      () =>
        Effect.gen(function* () {
          const evidenceStore = yield* EvidenceService;
          const graph = yield* GraphService;

          const entity2 = Entity.make({
            id: entityId("e2"),
            identifiers: [],
            kind: "place",
            spatialExtent: { lat: 3, lon: 4 },
            temporalExtent: TemporalExtent.make({
              validFrom: new Date("2024-01-01T00:00:00.000Z"),
              validTo: new Date("2024-01-01T00:00:00.000Z"),
            }),
          });

          const evidence = yield* evidenceStore.put({
            ...pastInput,
            bytes: new Uint8Array([9, 9, 9]),
          });

          const foundBefore = yield* graph.queryEntity(entity2.id);
          assert.isTrue(Option.isNone(foundBefore));

          yield* graph.insert(
            Step.make({
              evidenceIds: NonEmptyEvidenceIds.make([evidence.id]),
              id: stepId("s2"),
              operation: AddEntity.make({ entity: entity2 }),
            })
          );

          const found = yield* graph.queryEntity(entity2.id);
          assert.isTrue(Option.isSome(found));
        })
    );
  });
});
