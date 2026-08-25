import type { GraphEntity, GraphSnapshot } from "./graph-layout.js";
import type { StepRecord } from "./provenance.js";

/**
 * What is actually in the case, and what an investigator has decided about it.
 *
 * Everything here is derived from the two things the engine already holds —
 * the folded graph and the step log — because those are the record. Nothing is
 * cached or maintained separately, so the table cannot drift from the log the
 * way an index can.
 *
 * **Curation is a judgement, not a fact.** The log is append-only and every
 * entity in it is attributed to evidence, so discarding one cannot unsay it.
 * Discarding hides a row from *this* investigator's view and nothing more; the
 * entity stays in the graph, in the log, and in any export. The UI says so
 * rather than letting "discard" read as "delete".
 */

/** What an analyst has decided about an entity. `new` means: not yet reviewed. */
export type CurationState = "deferred" | "discarded" | "kept" | "new";

/** Decisions by entity id. Persisted per (user, investigation) as view state. */
export type Curation = Readonly<Record<string, CurationState>>;

export interface Identifier {
  readonly kind: string;
  readonly value: string;
}

export interface CaseRow {
  /** Distinct sources that asserted it. Two is worth more than one twice. */
  readonly corroboration: number;
  /** Relations touching it — how connected this thing is, not a score. */
  readonly degree: number;
  /** Arrived in the most recent expansion. */
  readonly fresh: boolean;
  readonly id: string;
  /** Every identifier on the entity. These are the per-kind columns: a pack
   * decides what a kind shows by choosing what it attaches. */
  readonly identifiers: readonly Identifier[];
  readonly kind: string;
  /** Position of the first step asserting it, in log order. */
  readonly seenAt: number;
  readonly sources: readonly string[];
  readonly state: CurationState;
  readonly transforms: readonly string[];
  readonly value: string;
}

const displayValue = (entity: GraphEntity): string =>
  entity.identifiers?.[0]?.value ?? entity.id;

/** Every entity id a step asserts anything about. */
const assertedBy = (step: StepRecord): readonly string[] => {
  const { operation } = step;
  const ids: string[] = [];
  if (operation.entity !== undefined) {
    ids.push(operation.entity.id);
  }
  if (operation.relation !== undefined) {
    ids.push(operation.relation.sourceId, operation.relation.targetId);
  }
  for (const id of operation.event?.entityIds ?? []) {
    ids.push(id);
  }
  return ids;
};

/**
 * The case as rows.
 *
 * `freshFrom` is the log length the investigator last looked at: anything
 * asserted at or beyond it arrived in the latest expansion and is flagged, so
 * a hundred-row table still shows which six are new.
 */
export const caseRows = (
  graph: GraphSnapshot,
  steps: readonly StepRecord[],
  curation: Curation,
  freshFrom = Number.POSITIVE_INFINITY
): readonly CaseRow[] => {
  const sources = new Map<string, Set<string>>();
  const transforms = new Map<string, Set<string>>();
  const seenAt = new Map<string, number>();

  steps.forEach((step, index) => {
    for (const id of assertedBy(step)) {
      if (!seenAt.has(id)) {
        seenAt.set(id, index);
      }
      if (step.sourceId !== undefined) {
        const known = sources.get(id) ?? new Set<string>();
        known.add(step.sourceId);
        sources.set(id, known);
      }
      if (step.transformId !== undefined) {
        const known = transforms.get(id) ?? new Set<string>();
        known.add(step.transformId);
        transforms.set(id, known);
      }
    }
  });

  const degree = new Map<string, number>();
  for (const relation of graph.relations) {
    degree.set(relation.sourceId, (degree.get(relation.sourceId) ?? 0) + 1);
    degree.set(relation.targetId, (degree.get(relation.targetId) ?? 0) + 1);
  }

  const rows = graph.entities.map((entity): CaseRow => {
    const at = seenAt.get(entity.id) ?? 0;
    return {
      corroboration: sources.get(entity.id)?.size ?? 0,
      degree: degree.get(entity.id) ?? 0,
      fresh: at >= freshFrom,
      id: entity.id,
      identifiers: entity.identifiers ?? [],
      kind: entity.kind,
      seenAt: at,
      sources: [...(sources.get(entity.id) ?? [])].sort(),
      state: curation[entity.id] ?? "new",
      transforms: [...(transforms.get(entity.id) ?? [])].sort(),
      value: displayValue(entity),
    };
  });

  // Most-connected first: on a canvas that is the thing worth looking at, and
  // it puts a hub above the fifty leaves hanging off it. Ties break by id so
  // the same case always reads in the same order.
  return rows.sort(
    (a, b) =>
      b.degree - a.degree ||
      b.corroboration - a.corroboration ||
      a.id.localeCompare(b.id)
  );
};

export type CaseFilter = "all" | CurationState;

export const matches = (row: CaseRow, filter: CaseFilter): boolean =>
  filter === "all" || row.state === filter;

/** Record a decision. `new` clears one, so a mis-click is undoable. */
export const curate = (
  curation: Curation,
  id: string,
  state: CurationState
): Curation => {
  const next = { ...curation };
  if (state === "new") {
    delete next[id];
  } else {
    next[id] = state;
  }
  return next;
};

/**
 * Drop decisions about entities the graph no longer holds. Switching case
 * would otherwise leave the previous one's judgements attached to ids that
 * mean nothing here.
 */
export const prune = (curation: Curation, graph: GraphSnapshot): Curation => {
  const live = new Set(graph.entities.map((entity) => entity.id));
  const next: Record<string, CurationState> = {};
  for (const [id, state] of Object.entries(curation)) {
    if (live.has(id)) {
      next[id] = state;
    }
  }
  return next;
};

export interface Tally {
  readonly count: number;
  readonly name: string;
}

export interface CaseSummary {
  readonly byKind: readonly Tally[];
  readonly bySource: readonly Tally[];
  readonly corroborated: number;
  readonly deferred: number;
  readonly discarded: number;
  readonly fresh: number;
  readonly kept: number;
  readonly relations: number;
  readonly total: number;
  /** Not yet looked at. The number that says how much work is left. */
  readonly unreviewed: number;
}

const tally = (values: readonly string[]): readonly Tally[] => {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ count, name }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

/** What the case is made of, for someone who has not been watching it grow. */
export const summarise = (
  rows: readonly CaseRow[],
  relations: number
): CaseSummary => ({
  byKind: tally(rows.map((row) => row.kind)),
  bySource: tally(rows.flatMap((row) => row.sources)),
  corroborated: rows.filter((row) => row.corroboration > 1).length,
  deferred: rows.filter((row) => row.state === "deferred").length,
  discarded: rows.filter((row) => row.state === "discarded").length,
  fresh: rows.filter((row) => row.fresh).length,
  kept: rows.filter((row) => row.state === "kept").length,
  relations,
  total: rows.length,
  unreviewed: rows.filter((row) => row.state === "new").length,
});

/**
 * A stable colour slot per entity kind, assigned in first-seen order so the
 * same case always paints the same. Six slots, then it wraps — beyond that the
 * legend is doing the work anyway, and inventing more colours would only make
 * two kinds look deceptively similar.
 */
export const SLOTS = 6;

export const kindSlots = (
  rows: readonly CaseRow[]
): ReadonlyMap<string, number> => {
  const order = [...new Set(rows.map((row) => row.kind))].sort();
  return new Map(order.map((kind, index) => [kind, index % SLOTS]));
};
