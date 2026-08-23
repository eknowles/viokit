import { Schema } from "effect";
import { InvestigationId } from "./investigation.js";
import { PrincipalId } from "./principal.js";
import { EvidenceId } from "./schemas.js";

/**
 * Withholding material from an export, over a record that cannot be edited
 * (TDR-024).
 *
 * Evidence is write-once and its id *is* the digest of its bytes (I1); the step
 * log is append-only and replay is a fold over it (I3). So a redaction cannot
 * edit an artifact or delete a step — it is an additional fact, recorded like
 * any other, that the export and the read path consult.
 *
 * The consequence that matters: an export **names what it withheld**. A bundle
 * that quietly contains less than the case does is a misleading document, and
 * this project's whole claim is that the document can be trusted.
 */

export const RedactionId = Schema.String.pipe(Schema.brand("RedactionId"));
export type RedactionId = typeof RedactionId.Type;

export const redactionId = (value: string): RedactionId =>
  Schema.decodeUnknownSync(RedactionId)(value);

/**
 * Why material is being withheld.
 *
 * `retention` is the same record with a stronger obligation behind it: "may not
 * leave" and "may not be kept" share one vocabulary, and only the second can
 * escalate to destruction.
 */
export const RedactionGround = Schema.Literals([
  "sensitive",
  "third-party",
  "legal",
  "retention",
]);
export type RedactionGround = typeof RedactionGround.Type;

export class Redaction extends Schema.Class<Redaction>("Redaction")({
  /** The artifact withheld. Its bytes stay where they are (I1). */
  evidenceId: EvidenceId,
  ground: RedactionGround,
  id: RedactionId,
  /** The case this applies to — the unit the obligation usually arrives with. */
  investigation: InvestigationId,
  /** Stated plainly, because it travels: a recipient reads this. */
  reason: Schema.String,
  redactedAt: Schema.Date,
  /** Who withheld it. A redaction nobody is accountable for is not governance. */
  redactedBy: PrincipalId,
}) {}

/**
 * Reading material that has been withheld.
 *
 * A refusal rather than an empty result, for the same reason authorization
 * refuses: "you may not have this" and "there is nothing here" are different
 * facts, and returning the second for the first is a quiet lie.
 */
export class Redacted extends Schema.TaggedErrorClass<Redacted>()("Redacted", {
  message: Schema.String,
}) {}

export class RedactionWriteError extends Schema.TaggedErrorClass<RedactionWriteError>()(
  "RedactionWriteError",
  {
    message: Schema.String,
  }
) {}
