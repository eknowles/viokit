import type {
  EvidenceInput,
  Step,
  StepOperation,
  TransformRunner,
  TransformSpec,
} from "@viokit/schema";
import {
  NonEmptyEvidenceIds,
  SourceRuntimeService,
  Step as StepSchema,
  stepId,
  TransformError,
  TransformRunnerService,
} from "@viokit/schema";
import { Effect, Layer, Schema } from "effect";
import { EvidenceService } from "./evidence.js";
import { fnv1aHex } from "./hash.js";

/**
 * A projection maps the raw output of a transform's source run into graph
 * operations (entities/relations/events). Core never holds domain projections
 * (open-domain rule); callers/packs supply them. Each operation is attributed
 * to the run's evidence at step-build time (I2).
 */
export type TransformProjection = (
  evidence: EvidenceInput,
  input: unknown
) => readonly StepOperation[];

const toTransformError = (cause: unknown): TransformError =>
  TransformError.make({
    message: cause instanceof Error ? cause.message : String(cause),
  });

/** Decode the transform input against the spec's input schema (I6). */
const decodeInput = (
  spec: TransformSpec,
  input: unknown
): Effect.Effect<unknown, TransformError, never> =>
  Effect.try({
    catch: toTransformError,
    try: () => Schema.decodeUnknownSync(spec.input)(input),
  });

/**
 * The default transform runner. It decodes the input against the spec's input
 * schema (I6), runs the referenced source through SourceRuntime (I4/I10 — no
 * raw fetch here), persists the evidence, projects the raw output into graph
 * operations, and wraps each into a `Step` attributed to that evidence (I2).
 * It returns staged steps for the engine to commit; it never writes to the
 * graph itself.
 */
export const TransformRunnerLayer: Layer.Layer<
  TransformRunnerService,
  never,
  SourceRuntimeService | EvidenceService
> = Layer.effect(
  TransformRunnerService,
  Effect.gen(function* () {
    const runtime = yield* SourceRuntimeService;
    const evidence = yield* EvidenceService;
    let counter = 0;

    return {
      run: (
        spec,
        source,
        project,
        input
      ): Effect.Effect<readonly Step[], TransformError, never> =>
        Effect.gen(function* () {
          const decodedInput = yield* decodeInput(spec, input);

          const evidenceInput = yield* runtime
            .run(source)
            .pipe(Effect.mapError(toTransformError));

          const stored = yield* evidence
            .put(evidenceInput)
            .pipe(Effect.mapError(toTransformError));

          const operations = project(stored, decodedInput);

          const steps: Step[] = [];
          for (const operation of operations) {
            steps.push(
              StepSchema.make({
                evidenceIds: NonEmptyEvidenceIds.make([stored.id]),
                id: stepId(
                  fnv1aHex(new TextEncoder().encode(`${stored.id}:${counter}`))
                ),
                operation,
              })
            );
            counter += 1;
          }

          return steps;
        }),
    } satisfies TransformRunner;
  })
);
