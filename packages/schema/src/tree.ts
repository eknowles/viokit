import { Context, type Effect, Schema } from "effect";

/**
 * The investigation tree's records. A run is one transform applied to one
 * entity; the tree is read back from these, not stored separately.
 */

/** How a run ended. `empty` is a run that succeeded and derived nothing. */
export const RunOutcome = Schema.Literals(["ok", "empty", "failed"]);
export type RunOutcome = typeof RunOutcome.Type;

/** An entity a run discovered for the tree. */
export class AddedEntity extends Schema.Class<AddedEntity>("AddedEntity")({
  id: Schema.String,
  kind: Schema.String,
}) {}

export class RunRecord extends Schema.Class<RunRecord>("RunRecord")({
  /** Entities this run discovered for the tree (new to it), not every touched. */
  addedEntities: Schema.Array(AddedEntity),
  addedRelationCount: Schema.Number,
  /** Distance from the seed of the entity this run was applied to. */
  depth: Schema.Number,
  durationMs: Schema.Number,
  inputEntityId: Schema.String,
  inputKind: Schema.String,
  message: Schema.optionalKey(Schema.String),
  outcome: RunOutcome,
  runId: Schema.String,
  startedAt: Schema.String,
  /** The id of the pseudo-transform that records the seed. */
  transformId: Schema.String,
}) {}

/** The transform id under which the seed itself is recorded. */
export const SEED_TRANSFORM = "(seed)";

export const StopReason = Schema.Literals([
  "exhausted",
  "depth",
  "entities",
  "runs",
  "time",
]);
export type StopReason = typeof StopReason.Type;

export class SkippedTransform extends Schema.Class<SkippedTransform>(
  "SkippedTransform"
)({
  reason: Schema.String,
  transformId: Schema.String,
}) {}

export class TreeSummary extends Schema.Class<TreeSummary>("TreeSummary")({
  elapsedMs: Schema.Number,
  entities: Schema.Number,
  entitiesByKind: Schema.Record(Schema.String, Schema.Number),
  failed: Schema.Number,
  runs: Schema.Number,
  skipped: Schema.Array(SkippedTransform),
  stoppedBecause: StopReason,
}) {}

/** Which tool classifications may run. Both by default: nothing is refused for its kind. */
export const ToolKind = Schema.Literals(["passive", "active"]);
export type ToolKind = typeof ToolKind.Type;

export class ExpandRequest extends Schema.Class<ExpandRequest>("ExpandRequest")(
  {
    kinds: Schema.optionalKey(Schema.Array(ToolKind)),
    maxDepth: Schema.optionalKey(Schema.Number),
    maxEntities: Schema.optionalKey(Schema.Number),
    maxMs: Schema.optionalKey(Schema.Number),
    maxRuns: Schema.optionalKey(Schema.Number),
    seedKind: Schema.String,
    seedValue: Schema.String,
  }
) {}

export const TREE_DEFAULTS = {
  kinds: ["passive", "active"] as readonly ToolKind[],
  maxDepth: 3,
  maxEntities: 200,
  maxMs: 600_000,
  maxRuns: 100,
} as const;

/**
 * An append-only record of runs, scoped to one investigation. Behind a seam so
 * a backend can be swapped without touching the expander, the shape the
 * redaction and view-state stores already take.
 */
export interface RunLog {
  readonly append: (
    investigation: string,
    record: RunRecord
  ) => Effect.Effect<void>;
  readonly list: (investigation: string) => Effect.Effect<readonly RunRecord[]>;
}

export class RunLogService extends Context.Service<RunLogService, RunLog>()(
  "RunLogService"
) {}

/** A tree operation that could not start (an unsupported seed, for instance). */
export class TreeError extends Schema.TaggedErrorClass<TreeError>()(
  "TreeError",
  { message: Schema.String }
) {}

export interface RunNode {
  readonly children: readonly TreeNode[];
  readonly durationMs: number;
  readonly message?: string | undefined;
  readonly outcome: RunOutcome;
  readonly runId: string;
  readonly transformId: string;
}

export interface TreeNode {
  readonly entityId: string;
  readonly kind: string;
  readonly runs: readonly RunNode[];
}
