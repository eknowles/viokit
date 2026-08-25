import type { Field, FormShape } from "./form.js";
import type { GraphEntity, GraphSnapshot } from "./graph-layout.js";

/**
 * Working a case from the graph outwards: seed something, see what a node
 * offers, expand it.
 *
 * Two rules shape everything here.
 *
 * **The console holds no domain vocabulary.** It does not know that a
 * `hostname` field wants a `domain` identifier, and it will not decide that it
 * does. Fields are matched to a node's facts by *name equality* only. A near
 * miss is offered as a suggestion the investigator confirms, never applied
 * silently — that is the difference between a tool that helps and a tool that
 * quietly puts the wrong string into a live query.
 *
 * **A seed is not a fact.** The engine refuses any step not attributed to
 * evidence, so a value you typed cannot enter the graph by typing it. It lives
 * on the canvas as a starting point and nothing more, and is replaced by the
 * real entity the moment a transform actually asserts it.
 */

export interface Identifier {
  readonly kind: string;
  readonly value: string;
}

export type NodeOrigin = "graph" | "seed";

/** What a canvas node offers a transform. */
export interface CaseNode {
  readonly id: string;
  readonly identifiers: readonly Identifier[];
  /** Entity kind for a graph node; the declared kind, or "unknown", for a seed. */
  readonly kind: string;
  readonly label: string;
  readonly origin: NodeOrigin;
}

/** A seed: what you typed, before anything has evidenced it. */
export const seedNode = (value: string, kind?: string): CaseNode => {
  const trimmed = value.trim();
  return {
    id: `seed:${trimmed}`,
    identifiers:
      kind === undefined || kind === "" ? [] : [{ kind, value: trimmed }],
    kind: kind === undefined || kind === "" ? "unknown" : kind,
    label: trimmed,
    origin: "seed",
  };
};

export const entityNode = (entity: GraphEntity): CaseNode => ({
  id: entity.id,
  identifiers: entity.identifiers ?? [],
  kind: entity.kind,
  label: entity.identifiers?.[0]?.value ?? entity.id,
  origin: "graph",
});

/**
 * Has the graph caught up with this seed? True once any entity carries the
 * seed's value — as its id or on an identifier — which is what happens the
 * first time a transform asserts the thing you asked about.
 */
export const isRealised = (seed: CaseNode, graph: GraphSnapshot): boolean =>
  graph.entities.some(
    (entity) =>
      entity.id === seed.label ||
      (entity.identifiers ?? []).some(
        (identifier) => identifier.value === seed.label
      )
  );

/**
 * How well a transform's input fits a node.
 *
 * `exact` — a required field's name equals one of the node's identifier kinds,
 * or the node's entity kind. The value is unambiguous.
 *
 * `possible` — the transform takes a single required string and the node has a
 * value, but nothing lines up by name. Runnable, with the field pre-filled and
 * flagged, because the investigator knows their ontology and the console does
 * not.
 */
export type Fit = "exact" | "possible";

export interface Expansion {
  /** Field the node's value would go into. */
  readonly field: string;
  /** Prefilled values, keyed by field name. Fields not listed are left blank. */
  readonly fill: Readonly<Record<string, string>>;
  readonly fit: Fit;
  /** Why it matched, for the investigator to check rather than trust. */
  readonly reason: string;
  readonly transformId: string;
}

const requiredStrings = (fields: readonly Field[]): readonly Field[] =>
  fields.filter((field) => field.required && field.kind === "string");

/** The node fact whose name equals this field's, if there is one. */
const exactFact = (node: CaseNode, field: Field): Identifier | null => {
  const identifier = node.identifiers.find((one) => one.kind === field.name);
  if (identifier !== undefined) {
    return identifier;
  }
  if (node.kind === field.name && node.label !== "") {
    return { kind: node.kind, value: node.label };
  }
  return null;
};

export interface TransformContract {
  readonly id: string;
  readonly shape: FormShape;
}

/**
 * What this node can be expanded by, best fit first.
 *
 * A transform whose contract could not be derived is omitted rather than
 * guessed at: the raw-JSON fallback exists for the launcher, where a person is
 * reading the schema, not for a one-click expansion.
 */
export const expansionsFor = (
  node: CaseNode,
  contracts: readonly TransformContract[]
): readonly Expansion[] => {
  const found: Expansion[] = [];

  for (const contract of contracts) {
    if (contract.shape._tag !== "fields") {
      continue;
    }
    const needed = requiredStrings(contract.shape.fields);
    if (needed.length === 0) {
      continue;
    }

    const matched = needed
      .map((field) => ({ fact: exactFact(node, field), field }))
      .filter((one) => one.fact !== null);

    if (matched.length > 0) {
      const fill: Record<string, string> = {};
      for (const one of matched) {
        fill[one.field.name] = one.fact?.value ?? "";
      }
      const [first] = matched;
      found.push({
        field: first?.field.name ?? "",
        fill,
        fit: "exact",
        reason: `this node carries a ${first?.field.name ?? "matching"} value`,
        transformId: contract.id,
      });
      continue;
    }

    // Nothing lined up by name. Only offer it when there is exactly one thing
    // to fill: with two unmatched required strings there is no honest guess
    // about which one this node is.
    const only = needed.length === 1 ? needed[0] : undefined;
    if (only !== undefined && node.label !== "") {
      found.push({
        field: only.name,
        fill: { [only.name]: node.label },
        fit: "possible",
        reason: `takes one ${only.name}; nothing on this node is named that, so check it before running`,
        transformId: contract.id,
      });
    }
  }

  // Exact fits first, then stable by id — the same node must always offer the
  // same list in the same order.
  const rank = (fit: Fit): number => (fit === "exact" ? 0 : 1);
  return [...found].sort(
    (a, b) =>
      rank(a.fit) - rank(b.fit) || a.transformId.localeCompare(b.transformId)
  );
};

/**
 * Entities the graph gained between two snapshots. What an expansion actually
 * produced, reported as a count rather than assumed — a transform that returns
 * only things already known has found nothing new, and should say so.
 */
export const newEntities = (
  before: GraphSnapshot,
  after: GraphSnapshot
): readonly GraphEntity[] => {
  const known = new Set(before.entities.map((entity) => entity.id));
  return after.entities.filter((entity) => !known.has(entity.id));
};
