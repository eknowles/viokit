import type { GraphNodeView } from "./graph-view.js";

/** How many categorical colours the design system defines. */
export const SLOTS = 6;

/**
 * How an entity kind is shown (`04-web-ui` §4.2).
 *
 * A pack knows what its kinds *mean*; the console does not, and must not
 * pretend to. So presentation is data — a spec per kind — and the renderer
 * resolves it. Nothing here names a domain or an address: that is the
 * open-domain rule, and a console that hard-coded a domain icon would be a
 * console that could not show a kind a pack invented last week.
 *
 * No pack ships one of these yet. What that means for this module is that the
 * **fallback is the important half**: an undescribed kind must render as *an
 * entity of an undescribed kind*, showing what it is, rather than borrowing a
 * presentation that implies knowledge nobody supplied.
 */

export interface ViewSpec {
  /** A short marker — "verified", "expired". Shown next to the label. */
  readonly badge?: string;
  /** Categorical slot, 1–6. Omitted means: assign one from the kinds present. */
  readonly colour?: number;
  /** An image drawn as the node. A URL the console can load. */
  readonly icon?: string;
  /** What to call this kind in a legend. Defaults to the kind itself. */
  readonly label?: string;
}

/** View specs by entity kind. Absent kinds fall back, which is the point. */
export type ViewSpecs = Readonly<Record<string, ViewSpec>>;

/**
 * Colour slots for the kinds present.
 *
 * Sorted so the assignment is stable: a kind must not change colour because a
 * different entity happened to arrive first. Wraps at `SLOTS` — beyond six
 * kinds two share a colour, which the legend then has to disambiguate by name.
 */
export const slotsForKinds = (
  kinds: readonly string[]
): ReadonlyMap<string, number> => {
  const order = [...new Set(kinds)].sort();
  return new Map(order.map((kind, index) => [kind, index % SLOTS]));
};

/**
 * The presentation for one kind: the classes a node carries and what it is
 * called. A spec's explicit colour wins over the assigned slot, because a pack
 * that has chosen a colour has chosen it for a reason.
 */
export const presentationFor = (
  kind: string,
  specs: ViewSpecs,
  slots: ReadonlyMap<string, number>
): {
  readonly classes: readonly string[];
  readonly described: boolean;
  readonly icon?: string;
  readonly label: string;
} => {
  const spec = specs[kind];
  const slot = spec?.colour ?? (slots.get(kind) ?? 0) + 1;
  return {
    classes: [`vk-node--cat-${((slot - 1) % SLOTS) + 1}`],
    described: spec !== undefined,
    ...(spec?.icon === undefined ? {} : { icon: spec.icon }),
    // The kind itself is the honest default: it says what the thing is
    // without claiming to know what a pack would have called it.
    label: spec?.label ?? kind,
  };
};

/**
 * What a node is announced and titled as.
 *
 * An undescribed kind still names its kind — that is the difference between
 * "we do not have a spec for this" and "this is a generic thing", and only the
 * first is true.
 */
export const titleFor = (
  node: Pick<GraphNodeView, "kind" | "label">,
  specs: ViewSpecs
): string => `${specs[node.kind]?.label ?? node.kind} ${node.label}`;

export interface LegendEntry {
  readonly cat: number;
  readonly count: number;
  readonly label: string;
}

/**
 * The legend for the kinds actually on screen.
 *
 * A colour encoding nobody can decode is decoration, so every colour in use
 * appears here — including the ones no pack has described, which are listed
 * under their kind rather than omitted for want of a nicer name.
 */
export const legendFor = (
  kinds: readonly string[],
  specs: ViewSpecs,
  slots: ReadonlyMap<string, number>,
  counts: ReadonlyMap<string, number> = new Map()
): readonly LegendEntry[] =>
  [...new Set(kinds)].sort().map((kind) => {
    const spec = specs[kind];
    return {
      cat: spec?.colour ?? (slots.get(kind) ?? 0) + 1,
      count: counts.get(kind) ?? 0,
      label: spec?.label ?? kind,
    };
  });
