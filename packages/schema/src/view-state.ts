import { Context, type Effect, type Option, Schema } from "effect";

/**
 * View state (TDR-012, I12): a surface's configuration — layout, filters,
 * selection — stored durably and *apart* from the evidentiary record. It is
 * never written to the step log, never stored with evidence, and never appears
 * in a replay; an investigation must be reproducible without it.
 */

/**
 * Where a document belongs. All three parts are required even though `user` and
 * `investigation` are placeholders today (there is no authentication and no
 * investigations capability yet) — requiring them at the call site keeps the
 * placeholder visible, so the day they become real is a compile error rather
 * than a silently wrong answer.
 */
export class ViewStateKey extends Schema.Class<ViewStateKey>("ViewStateKey")({
  investigation: Schema.String,
  surface: Schema.String,
  user: Schema.String,
}) {}

/**
 * The stored envelope. `payload` is opaque to the store: a surface owns the
 * shape of its own configuration, and enumerating every surface's fields in the
 * shared schema would put UI shape in core — the same reason domain entity
 * types live in packs. The store validates the envelope; the surface validates
 * its payload.
 */
export class ViewStateDocument extends Schema.Class<ViewStateDocument>(
  "ViewStateDocument"
)({
  key: ViewStateKey,
  payload: Schema.Json,
  version: Schema.Int,
}) {}

export class ViewStateWriteError extends Schema.TaggedErrorClass<ViewStateWriteError>()(
  "ViewStateWriteError",
  {
    message: Schema.String,
  }
) {}

/**
 * Durable per-surface view state.
 *
 * `load` reports absence for a key never written, a document that cannot be
 * decoded, *and* one whose version the caller does not recognise. All three
 * mean the same thing to a surface — start from defaults — and collapsing them
 * removes the branch where "corrupt" is handled differently from "new" and
 * handled wrong. Unusable configuration must never make an investigation
 * unusable.
 */
export interface ViewStateStore {
  readonly load: (
    key: ViewStateKey,
    version: number
  ) => Effect.Effect<Option.Option<ViewStateDocument>>;
  readonly save: (
    document: ViewStateDocument
  ) => Effect.Effect<void, ViewStateWriteError>;
}

export class ViewStateStoreService extends Context.Service<
  ViewStateStoreService,
  ViewStateStore
>()("ViewStateStoreService") {}

/** Placeholders until governance (P4) and the investigations capability exist. */
export const localUser = "local";
export const defaultInvestigation = "default";
