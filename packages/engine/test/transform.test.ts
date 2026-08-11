import { assert, describe, layer } from "@effect/vitest";
import {
  AddEntity,
  Entity,
  type EvidenceInput,
  entityId,
  SourceSpec,
  SourceTransportService,
  TransformRunnerService,
  TransformSpec,
} from "@viokit/schema";
import { Effect, Layer, Result, Schema } from "effect";
import { CacheLayer } from "../src/cache.js";
import { EgressLayer } from "../src/egress.js";
import { EvidenceBackendMemory, EvidenceLayer } from "../src/evidence-fs.js";
import { RateLimiterLayer } from "../src/rate-limit.js";
import { SourceRuntimeLayer } from "../src/source-runtime.js";
import { TransformRunnerLayer } from "../src/transform.js";

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

const transformSpec = TransformSpec.make({
  archetype: "extract",
  id: "t1",
  input: Schema.Any,
  output: Schema.Any,
  projection: Schema.Any,
  sourceId: "s1",
});

// A domain projection (supplied by a pack in real usage): turns the raw evidence
// bytes into one AddEntity operation, attributed to the run's evidence (I2).
const project = (_evidence: EvidenceInput, _input: unknown) => [
  AddEntity.make({
    entity: Entity.make({
      id: entityId("e1"),
      identifiers: [],
      kind: "person",
      spatialExtent: { lat: 1, lon: 2 },
      temporalExtent: {
        validFrom: new Date("2024-01-01T00:00:00.000Z"),
        validTo: new Date("2024-01-01T00:00:00.000Z"),
      },
    }),
  }),
];

const runtimeLayer = Layer.provide(
  SourceRuntimeLayer,
  Layer.merge(
    Layer.merge(fakeTransport, CacheLayer),
    Layer.merge(EgressLayer, RateLimiterLayer)
  )
);

const evidenceLayer = Layer.provide(EvidenceLayer, EvidenceBackendMemory);

const transformLayer = Layer.provide(
  TransformRunnerLayer,
  Layer.merge(runtimeLayer, evidenceLayer)
);
describe("transform runner", () => {
  layer(transformLayer)((it) => {
    it.effect(
      "runs source through SourceRuntime and projects to steps (I2/I4)",
      () =>
        Effect.gen(function* () {
          const runner = yield* TransformRunnerService;
          const steps = yield* runner.run(
            transformSpec,
            sourceSpec,
            project,
            null
          );
          assert.strictEqual(steps.length, 1);
          const [step] = steps;
          if (step === undefined) {
            assert.fail("expected one step");
          }
          assert.strictEqual(step.operation._tag, "AddEntity");
          // Each step is attributed to the evidence the source run produced (I2).
          assert.strictEqual(step.evidenceIds.length, 1);
        })
    );

    it.effect(
      "rejects invalid input against the spec's input schema (I6)",
      () =>
        Effect.gen(function* () {
          const runner = yield* TransformRunnerService;
          const result = yield* runner
            .run(
              { ...transformSpec, input: Schema.Number },
              sourceSpec,
              project,
              "not a number"
            )
            .pipe(Effect.result);
          assert.isTrue(Result.isFailure(result));
        })
    );
  });
});
