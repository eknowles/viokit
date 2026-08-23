import { Clock, Effect, Schema } from "effect";
import { EvidenceInput, GraphState, TemporalExtent } from "./schemas.js";

export class FutureDatedEvidenceError extends Schema.TaggedErrorClass<FutureDatedEvidenceError>()(
  "FutureDatedEvidenceError",
  {
    message: Schema.String,
  }
) {}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/**
 * A `JSON.parse` reviver that turns the ISO-8601 strings JSON encoding produces
 * back into `Date`s.
 *
 * Schemas here carry `Date` on both the type and the encoded side, so a value
 * that has crossed a JSON boundary — a wire payload, a JSON column — no longer
 * decodes without this: `Schema.decodeUnknownSync` reports "Expected a valid
 * Date" for the string. Any boundary that reads JSON back into schema values
 * needs it.
 */
export const reviveDates = (_key: string, value: unknown): unknown => {
  if (typeof value === "string" && isoDatePattern.test(value)) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return date;
    }
  }
  return value;
};

/**
 * Revive dates throughout an already-parsed JSON value (or parse a JSON string
 * with the reviver applied).
 */
export const reviveJsonDates = (value: unknown): unknown =>
  typeof value === "string"
    ? JSON.parse(value, reviveDates)
    : JSON.parse(JSON.stringify(value), reviveDates);

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
