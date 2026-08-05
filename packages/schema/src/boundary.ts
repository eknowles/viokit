import { Clock, Effect, Schema } from "effect";
import { EvidenceInput, GraphState, TemporalExtent } from "./schemas.js";

export class FutureDatedEvidenceError extends Schema.TaggedErrorClass<FutureDatedEvidenceError>()(
  "FutureDatedEvidenceError",
  {
    message: Schema.String,
  }
) {}

const decodeTemporalExtent = Schema.decodeUnknownEffect(TemporalExtent);
const decodeEvidenceInput = Schema.decodeUnknownEffect(EvidenceInput);
const decodeGraphState = Schema.decodeUnknownEffect(GraphState);

/**
 * Decode and validate an unknown value as a temporal extent. Rejects invalid
 * ranges (`validFrom > validTo`) per I5.
 */
export const decodeTemporalExtentBoundary = decodeTemporalExtent;

/**
 * Decode and validate evidence at the boundary. In addition to schema
 * conformance (I6), rejects future-dated evidence (`observedAt > now`) per I5,
 * using the current clock.
 */
export const decodeEvidenceBoundary = (input: unknown) =>
  Effect.gen(function* () {
    const evidenceInput = yield* decodeEvidenceInput(input);
    const now = yield* Clock.currentTimeMillis;
    if (evidenceInput.observedAt.getTime() > now) {
      return yield* FutureDatedEvidenceError.make({
        message: "evidence observedAt must not be in the future",
      });
    }
    return evidenceInput;
  });

export const decodeGraphStateBoundary = decodeGraphState;
