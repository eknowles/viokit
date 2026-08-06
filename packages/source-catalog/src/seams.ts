import type {
  AlreadyPromoted,
  CandidateNotFound,
  SourceCandidate,
  SourceCandidateId,
  SourceCandidateInput,
} from "@viokit/schema";
import { SourceAccess, SourceTransportKind } from "@viokit/schema";
import type { Effect, Option } from "effect";
import { Context, Data, Schema } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";

/**
 * A unit of discovery work: `{category, archetype}`. Agents claim units so the
 * space is partitioned across the swarm and no two agents scan the same slice.
 */
export class WorkUnit extends Schema.Class<WorkUnit>("WorkUnit")({
  archetype: Schema.String,
  category: Schema.String,
  claimedBy: Schema.optionalKey(Schema.String),
  id: Schema.String,
  leasedUntil: Schema.optionalKey(Schema.Date),
}) {}

/**
 * The `list_candidates` filter, decoded at the boundary.
 */
export const CandidateFilterSchema = Schema.Struct({
  archetype: Schema.optionalKey(Schema.String),
  category: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.String),
});
export type CandidateFilter = typeof CandidateFilterSchema.Type;

/**
 * The claimable discovery work queue. Narrow interface so the SQLite backend
 * (TDR-013) can be swapped without changing consumers.
 */
export interface WorkQueue {
  readonly claim: (
    agent: string
  ) => Effect.Effect<Option.Option<WorkUnit>, SqlError>;
  readonly list: () => Effect.Effect<readonly WorkUnit[], SqlError>;
  readonly release: (
    id: string,
    agent: string
  ) => Effect.Effect<void, SqlError>;
  readonly reopenExpired: (now: Date) => Effect.Effect<number, SqlError>;
  readonly seed: (
    units: ReadonlyArray<{
      readonly category: string;
      readonly archetype: string;
    }>
  ) => Effect.Effect<number, SqlError>;
}

export class WorkQueueService extends Context.Service<
  WorkQueueService,
  WorkQueue
>()("WorkQueueService") {}

/**
 * A failure to decode/validate an agent-supplied payload at the service
 * boundary (schema-first I6: decode, never trust).
 */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
}> {}

/**
 * The enrichable fields on a candidate, validated at the boundary.
 */
export const CandidatePatchSchema = Schema.Struct({
  access: Schema.optionalKey(SourceAccess),
  archetype: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  note: Schema.optionalKey(Schema.String),
  origin: Schema.optionalKey(Schema.String),
  transport: Schema.optionalKey(SourceTransportKind),
});
export type CandidatePatch = typeof CandidatePatchSchema.Type;

/**
 * The deduplicated candidate registry. Insert-or-merge on identity fingerprint;
 * immutable history with a supersede path.
 */
export interface CandidateStore {
  readonly enrich: (
    id: SourceCandidateId,
    patch: CandidatePatch
  ) => Effect.Effect<SourceCandidate, CandidateNotFound | SqlError>;
  readonly get: (
    id: SourceCandidateId
  ) => Effect.Effect<
    Option.Option<SourceCandidate>,
    CandidateNotFound | SqlError
  >;
  readonly list: (
    filter: CandidateFilter
  ) => Effect.Effect<readonly SourceCandidate[], SqlError>;
  readonly markPromoted: (
    id: SourceCandidateId,
    promotion: unknown
  ) => Effect.Effect<
    SourceCandidate,
    CandidateNotFound | AlreadyPromoted | SqlError
  >;
  readonly submit: (
    input: SourceCandidateInput
  ) => Effect.Effect<SourceCandidate, CandidateNotFound | SqlError>;
  readonly supersede: (
    oldId: SourceCandidateId,
    replacementId: SourceCandidateId
  ) => Effect.Effect<SourceCandidate, CandidateNotFound | SqlError>;
}

export class CandidateStoreService extends Context.Service<
  CandidateStoreService,
  CandidateStore
>()("CandidateStoreService") {}

/**
 * Writes a promoted candidate's `SourceSpec` into a pack's `sources.ts`.
 * Lives behind a seam so it can be faked in tests without touching disk.
 */
export class PromotionError extends Data.TaggedError("PromotionError")<{
  readonly cause: unknown;
  readonly id: string;
}> {}

export interface Promoter {
  readonly writeSource: (
    category: string,
    sourceId: string,
    source: unknown
  ) => Effect.Effect<void, PromotionError>;
}

export class PromoterService extends Context.Service<
  PromoterService,
  Promoter
>()("PromoterService") {}
