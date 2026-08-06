import { Schema } from "effect";

/**
 * Lifecycle of a source candidate in the discovery harness.
 * `new` → `claimed` (optional) → `promoted` | `rejected`. `rejected` also marks
 * a superseded (corrected) record; see `CandidateStore` supersede path.
 */
export const SourceCandidateStatus = Schema.Literals([
  "new",
  "claimed",
  "promoted",
  "rejected",
]);
export type SourceCandidateStatus = typeof SourceCandidateStatus.Type;

/** How a source is reached. Distinct from its `SourceSpec.transport`. */
export const SourceAccess = Schema.Literals([
  "open_api",
  "dataset",
  "browser_scrape",
  "requires_key",
  "unknown",
]);
export type SourceAccess = typeof SourceAccess.Type;

export const SourceTransportKind = Schema.Literals([
  "http",
  "dataset",
  "browser",
  "unknown",
]);
export type SourceTransportKind = typeof SourceTransportKind.Type;

export const SourceCandidateId = Schema.String.pipe(
  Schema.brand("SourceCandidateId")
);
export type SourceCandidateId = typeof SourceCandidateId.Type;

export const sourceCandidateId = (value: string): SourceCandidateId =>
  Schema.decodeUnknownSync(SourceCandidateId)(value);

/**
 * The thin submission payload an agent sends: identity plus optional
 * classification/provenance. Everything but identity is optional so agents
 * submit fast and enrich later (design decision B). `status`/`notes`/`id` are
 * not supplied by agents; the store derives them.
 */
export const SourceCandidateInput = Schema.Struct({
  access: Schema.optionalKey(SourceAccess),
  archetypes: Schema.NonEmptyArray(Schema.String),
  category: Schema.String,
  description: Schema.optionalKey(Schema.String),
  discoveredAt: Schema.optionalKey(Schema.Date),
  discoveredBy: Schema.optionalKey(Schema.String),
  domain: Schema.String,
  origin: Schema.optionalKey(Schema.String),
  transport: Schema.optionalKey(SourceTransportKind),
  url: Schema.String,
});
export type SourceCandidateInput = typeof SourceCandidateInput.Type;

/**
 * A stored, deduped source candidate. Identity (`domain`+`url`, fingerprinted
 * into `id`) is immutable; `status`/`notes` carry the lifecycle and merge
 * history.
 */
export class SourceCandidate extends Schema.Class<SourceCandidate>(
  "SourceCandidate"
)({
  access: Schema.optionalKey(SourceAccess),
  archetypes: Schema.NonEmptyArray(Schema.String),
  category: Schema.String,
  description: Schema.optionalKey(Schema.String),
  discoveredAt: Schema.optionalKey(Schema.Date),
  discoveredBy: Schema.optionalKey(Schema.String),
  domain: Schema.String,
  id: SourceCandidateId,
  notes: Schema.Array(Schema.String),
  origin: Schema.optionalKey(Schema.String),
  status: SourceCandidateStatus,
  transport: Schema.optionalKey(SourceTransportKind),
  url: Schema.String,
}) {}

export class ClaimConflict extends Schema.TaggedErrorClass<ClaimConflict>()(
  "ClaimConflict",
  {
    message: Schema.String,
  }
) {}

export class CandidateNotFound extends Schema.TaggedErrorClass<CandidateNotFound>()(
  "CandidateNotFound",
  {
    message: Schema.String,
  }
) {}

export class AlreadyPromoted extends Schema.TaggedErrorClass<AlreadyPromoted>()(
  "AlreadyPromoted",
  {
    message: Schema.String,
  }
) {}
