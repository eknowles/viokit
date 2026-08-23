import { Schema } from "effect";

/**
 * Investigations: the unit of work (TDR-025).
 *
 * Everything before this belonged to one undifferentiated graph — every
 * acquisition, every derived entity, one log, one replay, and an export that
 * wrote the whole machine rather than a case.
 *
 * A **branch is an investigation with a parent**. Two types would have been two
 * lifecycles and two sets of operations to keep in step for what is one nullable
 * field; with one type, fork, discard, open, list, and export work on both
 * without special cases.
 */

export const InvestigationId = Schema.String.pipe(
  Schema.brand("InvestigationId")
);
export type InvestigationId = typeof InvestigationId.Type;

export const investigationId = (value: string): InvestigationId =>
  Schema.decodeUnknownSync(InvestigationId)(value);

/**
 * `discarded` is a rejected hypothesis, not a deletion: the log is append-only
 * (I3), so discarding stops an investigation contributing without removing a
 * step. Whether a discarded branch travels in its parent's export is a policy
 * question — a reviewer may well need to see what was rejected.
 */
export const InvestigationStatus = Schema.Literals(["open", "discarded"]);
export type InvestigationStatus = typeof InvestigationStatus.Type;

export class Investigation extends Schema.Class<Investigation>("Investigation")(
  {
    createdAt: Schema.Date,
    /**
     * Where this branch left its parent. Steps at or before it are inherited;
     * steps after it are the parent's alone. Absent exactly when `parent` is.
     */
    forkedAt: Schema.optionalKey(Schema.Number),
    id: InvestigationId,
    name: Schema.String,
    /** Present on a branch, absent on a root investigation. */
    parent: Schema.optionalKey(InvestigationId),
    status: InvestigationStatus,
  }
) {}

/**
 * An artifact more than one investigation cites.
 *
 * Surfaced deliberately rather than as a side effect: for a tool whose whole
 * claim is provenance, noticing that two cases rest on the same bytes is the
 * kind of connection it exists to find. It is a separately-named operation so
 * that no ordinary query can be mistaken for one that crosses cases.
 */
export class SharedArtifact extends Schema.Class<SharedArtifact>(
  "SharedArtifact"
)({
  evidenceId: Schema.String,
  investigationIds: Schema.Array(InvestigationId),
}) {}

export class UnknownInvestigation extends Schema.TaggedErrorClass<UnknownInvestigation>()(
  "UnknownInvestigation",
  {
    message: Schema.String,
  }
) {}

/**
 * The investigation the existing unpartitioned log becomes, named for what it
 * is. Its steps predate cases; they are not lost and not silently attributed to
 * a case someone chose.
 */
export const LEGACY_INVESTIGATION_NAME = "before cases existed";
