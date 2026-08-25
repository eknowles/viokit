import type { CaseRow, CurationState } from "./case-table.js";
import type { GraphSnapshot } from "./graph-layout.js";

/**
 * What columns a table of entities should have.
 *
 * The console cannot name the columns for a `person` or a `certificate` — it
 * holds no domain vocabulary, and the kinds are registered by packs at runtime.
 * So columns are **derived from the data**: the identifier kinds actually
 * present on the entities being shown. A pack decides a kind's columns by
 * choosing what identifiers to attach to it, which is the open-domain rule
 * working as intended rather than a registry the console would have to be
 * taught about.
 *
 * `Entity` carries no attribute bag today (`{id, identifiers, kind,
 * spatialExtent, temporalExtent}`), so identifiers are the only per-kind facts
 * there are. If entities ever gain attributes, this is the seam that widens:
 * `columnsFor` grows a second source and nothing above it changes.
 */

export type TableMode =
  | { readonly _tag: "all" }
  | { readonly _tag: "kind"; readonly kind: string }
  | { readonly _tag: "relations" };

export const modeKey = (mode: TableMode): string =>
  mode._tag === "kind" ? `kind:${mode.kind}` : mode._tag;

export const modeLabel = (mode: TableMode): string =>
  mode._tag === "kind" ? mode.kind : mode._tag;

/**
 * The identifier kinds present across these rows, most common first so the
 * column every row fills sits leftmost. Ties break by name, so the same case
 * always lays out the same way.
 */
export const columnsFor = (rows: readonly CaseRow[]): readonly string[] => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    // A kind appearing twice on one entity still only earns one column.
    for (const kind of new Set(row.identifiers.map((one) => one.kind))) {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind]) => kind);
};

/**
 * An entity's identifiers flattened for the table. Where a kind repeats, the
 * first wins and the rest are counted — dropping them silently would make a
 * cell claim to be the whole truth about that field.
 */
export const identifierCells = (
  row: CaseRow
): Readonly<
  Record<string, { readonly extra: number; readonly value: string }>
> => {
  const cells: Record<string, { extra: number; value: string }> = {};
  for (const identifier of row.identifiers) {
    const seen = cells[identifier.kind];
    if (seen === undefined) {
      cells[identifier.kind] = { extra: 0, value: identifier.value };
    } else {
      seen.extra += 1;
    }
  }
  return cells;
};

const IMAGE_PATH = /\.(?:avif|gif|jpeg|jpg|png|svg|webp)$/i;

/**
 * Is this value an image?
 *
 * Decided from the value's own shape, never from the identifier's name: that a
 * value *is* an image URL is a fact, whereas "a field called `photo` holds a
 * picture" is a guess about someone else's vocabulary. Only http(s) and data
 * URLs — anything else is not something to hand to an <img src>.
 */
export const isImageValue = (value: string): boolean => {
  if (value.startsWith("data:image/")) {
    return true;
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      IMAGE_PATH.test(url.pathname)
    );
  } catch {
    return false;
  }
};

/**
 * Columns whose values are images. A column qualifies only if every value it
 * actually holds is one — a column that is half pictures and half strings is a
 * column of strings, and rendering it as a gallery would hide the rest.
 */
export const imageColumns = (
  rows: readonly CaseRow[],
  columns: readonly string[]
): readonly string[] =>
  columns.filter((column) => {
    const values = rows
      .map((row) => identifierCells(row)[column]?.value)
      .filter((value): value is string => value !== undefined);
    return values.length > 0 && values.every(isImageValue);
  });

export interface RelationRow {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceKind: string;
  readonly sourceValue: string;
  /** Muted when either end has been discarded. */
  readonly state: CurationState;
  readonly targetId: string;
  readonly targetKind: string;
  readonly targetValue: string;
  readonly type: string;
}

/**
 * The relations, with their endpoints resolved to what the table already shows
 * those entities as — an edge listing two opaque ids is not a readable answer
 * to "how is this connected".
 */
export const relationRows = (
  graph: GraphSnapshot,
  rows: readonly CaseRow[]
): readonly RelationRow[] => {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return graph.relations
    .map((relation): RelationRow => {
      const source = byId.get(relation.sourceId);
      const target = byId.get(relation.targetId);
      return {
        id: relation.id,
        sourceId: relation.sourceId,
        sourceKind: source?.kind ?? "—",
        sourceValue: source?.value ?? relation.sourceId,
        state:
          source?.state === "discarded" || target?.state === "discarded"
            ? "discarded"
            : "new",
        targetId: relation.targetId,
        targetKind: target?.kind ?? "—",
        targetValue: target?.value ?? relation.targetId,
        type: relation.type,
      };
    })
    .sort(
      (a, b) =>
        a.type.localeCompare(b.type) ||
        a.sourceValue.localeCompare(b.sourceValue) ||
        a.targetValue.localeCompare(b.targetValue)
    );
};

/** The kinds worth offering as their own tab, biggest first. */
export const kindTabs = (
  rows: readonly CaseRow[]
): readonly { readonly count: number; readonly kind: string }[] => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({ count, kind }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
};

export const rowsForMode = (
  rows: readonly CaseRow[],
  mode: TableMode
): readonly CaseRow[] =>
  mode._tag === "kind" ? rows.filter((row) => row.kind === mode.kind) : rows;
