import { assert, describe, layer } from "@effect/vitest";
import {
  AddEntity,
  Entity,
  type EvidenceInput,
  entityId,
  Identifier,
  MatchRule,
  SourceSpec,
  SourceTransportService,
  TemporalExtent,
  TransformSpec,
} from "@viokit/schema";
import { Effect, Layer, Schema } from "effect";
import { Engine, EngineLayer } from "../src/engine.js";
import { EvidenceBackendMemory } from "../src/evidence-fs.js";
import { OntologyRegistryLayer } from "../src/ontology.js";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const extent = TemporalExtent.make({
  validFrom: new Date("2024-06-01T00:00:00.000Z"),
  validTo: new Date("2024-06-30T00:00:00.000Z"),
});

const mkEntity = (id: string, identifiers: Identifier[] = []): Entity =>
  Entity.make({
    id: entityId(id),
    identifiers,
    kind: "person",
    spatialExtent: { lat: 0, lon: 0 },
    temporalExtent: extent,
  });

const identifier = (kind: string, value: string): Identifier =>
  Identifier.make({ kind, value });

const emailRule = MatchRule.make({
  identifierKind: "email",
  normalizations: ["lower", "trim"],
});

// Two sources: the first seeds an existing entity; the second stages a
// duplicate whose email normalizes to the same canonical form.
const seedSource = SourceSpec.make({
  id: "seed",
  transport: "http",
  url: "https://seed.example/alice",
});
const dupSource = SourceSpec.make({
  id: "dup",
  transport: "http",
  url: "https://dup.example/alice",
});

const dispatchTransport = Layer.succeed(SourceTransportService, {
  fetch: (source) =>
    Effect.succeed({
      bytes: source.url.includes("dup")
        ? text("duplicate record for alice")
        : text("primary record for alice"),
      contentType: "text/plain",
    }),
});

// The default Engine layer runs on the retained DuckDB store and already
// provides its graph/transform/correlate/evidence slices; we only supply the
// transport and the evidence backend config (matches the engine.test.ts shape).
const engineLayer = Layer.provide(
  EngineLayer,
  Layer.mergeAll(
    dispatchTransport,
    EvidenceBackendMemory,
    OntologyRegistryLayer
  )
);

const seedSpec = TransformSpec.make({
  archetype: "extract",
  id: "t-seed",
  input: Schema.Any,
  output: Schema.Any,
  projection: Schema.Any,
  sourceId: "seed",
});

const seedProject = (_evidence: EvidenceInput, _input: unknown) => [
  AddEntity.make({
    entity: mkEntity("existing", [identifier("email", "alice@example.com")]),
  }),
];

const dupProject = (_evidence: EvidenceInput, _input: unknown) => [
  AddEntity.make({
    entity: mkEntity("dup", [identifier("email", "  ALICE@example.com ")]),
  }),
];

/**
 * P2 seam proof: the full pipeline threaded through the public `Engine` seam —
 * `runTransform` stages attributed steps, `correlate` folds a normalized
 * duplicate into a `ResolveEntity` merge, `insert` commits to the retained
 * store, and `replay`/`relatedness` reproduce and query it (I2/I3).
 */
describe("P2 seam: pipeline over the default Engine layer", () => {
  layer(engineLayer)((it) => {
    it.effect(
      "runTransform stages evidenced steps; insert + replay land them (I2/I3)",
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;

          const seedSteps = yield* engine.runTransform(
            seedSpec,
            seedSource,
            seedProject,
            null
          );
          assert.strictEqual(seedSteps.length, 1);
          // Every step is attributed to its run's evidence (I2).
          assert.isTrue(
            seedSteps.every((step) => step.evidenceIds.length === 1)
          );

          for (const step of seedSteps) {
            yield* engine.insert(step);
          }
          const state = yield* engine.replay;
          assert.strictEqual(state.entities.length, 1);
          assert.strictEqual(state.entities[0]?.id, "existing");

          // Replay reproduces the folded state deterministically (I3).
          const second = yield* engine.replay;
          assert.strictEqual(second.entities.length, state.entities.length);
        })
    );

    it.effect(
      "correlate promotes a normalized duplicate into a ResolveEntity merge",
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;

          const seedSteps = yield* engine.runTransform(
            seedSpec,
            seedSource,
            seedProject,
            null
          );
          for (const step of seedSteps) {
            yield* engine.insert(step);
          }

          const dupSteps = yield* engine.runTransform(
            seedSpec,
            dupSource,
            dupProject,
            null
          );
          const current = yield* engine.replay;
          const merges = yield* engine.correlate(dupSteps, current, [
            emailRule,
          ]);
          assert.strictEqual(merges.length, 1);
          const [merge] = merges;
          assert.isDefined(merge);
          assert.strictEqual(merge.operation._tag, "ResolveEntity");
          if (merge.operation._tag === "ResolveEntity") {
            assert.strictEqual(merge.operation.mergeId, "dup");
            assert.strictEqual(merge.operation.canonicalId, "existing");
            assert.strictEqual(merge.operation.confidence, 1);
          }
        })
    );

    it.effect(
      "relatedness over DuckDB ranks entities reachable from a seed",
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const seedSteps = yield* engine.runTransform(
            seedSpec,
            seedSource,
            seedProject,
            null
          );
          for (const step of seedSteps) {
            yield* engine.insert(step);
          }
          yield* engine.replay;

          // No relations exist yet, so the seed is the only reachable vertex.
          const related = yield* engine.relatedness("existing", 5);
          assert.deepStrictEqual(related, []);
        })
    );
  });
});
