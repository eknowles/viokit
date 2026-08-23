import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from "d3-force";

/**
 * Graph layout and the filtering that precedes it (TDR-020).
 *
 * `d3-force` is used for the one part worth buying — force-directed layout —
 * and nothing else: it knows nothing about how the result is drawn. The
 * simulation is stepped to a settled state rather than animated, because an
 * investigator wants to read a graph rather than watch it converge, and because
 * a settled layout is deterministic and therefore testable.
 */

export interface GraphEntity {
  readonly id: string;
  readonly identifiers?: readonly { kind: string; value: string }[];
  readonly kind: string;
  readonly temporalExtent: { validFrom: string; validTo: string };
}

export interface GraphRelation {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly temporalExtent: { validFrom: string; validTo: string };
  readonly type: string;
}

export interface GraphEvent {
  readonly entityIds: readonly string[];
  readonly id: string;
  readonly kind: string;
  readonly temporalExtent: { validFrom: string; validTo: string };
}

export interface GraphSnapshot {
  readonly entities: readonly GraphEntity[];
  readonly events?: readonly GraphEvent[];
  readonly relations: readonly GraphRelation[];
}

/** What a node stands for. Events are drawn distinctly: they are the graph's
 * time dimension, not another entity. */
export type NodeKind = "entity" | "event";

export interface PlacedNode {
  readonly entity: GraphEntity;
  readonly event?: GraphEvent;
  readonly kind: NodeKind;
  readonly x: number;
  readonly y: number;
}

export interface PlacedEdge {
  readonly id: string;
  /** Absent for the edge joining an event to a participant. */
  readonly relation?: GraphRelation;
  readonly source: PlacedNode;
  readonly target: PlacedNode;
}

export interface Layout {
  readonly edges: readonly PlacedEdge[];
  readonly nodes: readonly PlacedNode[];
  /** How many entities were omitted by the cap; zero when nothing was dropped. */
  readonly omitted: number;
}

/** Beyond this, SVG stops being the right renderer (TDR-020). */
export const DEFAULT_NODE_CAP = 200;

const within = (
  extent: { validFrom: string; validTo: string },
  at: number
): boolean => {
  const from = Date.parse(extent.validFrom);
  const to = Date.parse(extent.validTo);
  return (Number.isNaN(from) || from <= at) && (Number.isNaN(to) || at <= to);
};

/**
 * Restrict the graph to what was valid at a moment. Applied *before* layout:
 * masking after layout leaves the survivors scattered around the gaps where
 * hidden nodes used to be.
 */
export const atTime = (
  snapshot: GraphSnapshot,
  at: number | null
): GraphSnapshot => {
  if (at === null) {
    return snapshot;
  }
  const entities = snapshot.entities.filter((entity) =>
    within(entity.temporalExtent, at)
  );
  const ids = new Set(entities.map((entity) => entity.id));
  return {
    entities,
    events: (snapshot.events ?? []).filter((event) =>
      within(event.temporalExtent, at)
    ),
    relations: snapshot.relations.filter(
      (relation) =>
        within(relation.temporalExtent, at) &&
        ids.has(relation.sourceId) &&
        ids.has(relation.targetId)
    ),
  };
};

/**
 * Bound the graph to what the view can render, keeping the most-connected
 * entities. An arbitrary slice would be equally honest and far less useful —
 * and either way the caller reports that a subset is shown.
 */
export const capped = (
  snapshot: GraphSnapshot,
  cap: number
): { readonly omitted: number; readonly snapshot: GraphSnapshot } => {
  if (snapshot.entities.length <= cap) {
    return { omitted: 0, snapshot };
  }
  const degree = new Map<string, number>();
  for (const relation of snapshot.relations) {
    degree.set(relation.sourceId, (degree.get(relation.sourceId) ?? 0) + 1);
    degree.set(relation.targetId, (degree.get(relation.targetId) ?? 0) + 1);
  }
  const kept = [...snapshot.entities]
    .sort(
      (a, b) =>
        (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) ||
        a.id.localeCompare(b.id)
    )
    .slice(0, cap);
  const ids = new Set(kept.map((entity) => entity.id));
  return {
    omitted: snapshot.entities.length - kept.length,
    snapshot: {
      entities: kept,
      events: (snapshot.events ?? []).filter((event) =>
        event.entityIds.some((id) => ids.has(id))
      ),
      // Edges only where both ends survived: an edge into nothing is worse
      // than a missing edge.
      relations: snapshot.relations.filter(
        (relation) => ids.has(relation.sourceId) && ids.has(relation.targetId)
      ),
    },
  };
};

interface SimNode extends SimulationNodeDatum {
  readonly entity: GraphEntity;
  readonly event?: GraphEvent;
  readonly id: string;
  readonly kind: NodeKind;
}

const ITERATIONS = 200;

export const layout = (
  input: GraphSnapshot,
  options: { readonly cap?: number; readonly size?: number } = {}
): Layout => {
  const size = options.size ?? 600;
  const { omitted, snapshot } = capped(input, options.cap ?? DEFAULT_NODE_CAP);

  if (snapshot.entities.length === 0) {
    return { edges: [], nodes: [], omitted };
  }

  const events = snapshot.events ?? [];
  const nodes: SimNode[] = [
    ...snapshot.entities.map((entity) => ({
      entity,
      id: entity.id,
      kind: "entity" as const,
    })),
    ...events.map((event) => ({
      // An event borrows the entity shape for layout; `kind` is what the
      // renderer and the selection model go by.
      entity: {
        id: event.id,
        kind: event.kind,
        temporalExtent: event.temporalExtent,
      },
      event,
      id: event.id,
      kind: "event" as const,
    })),
  ];
  const links = [
    ...snapshot.relations.map((relation) => ({
      source: relation.sourceId,
      target: relation.targetId,
    })),
    ...events.flatMap((event) =>
      event.entityIds.map((entityId) => ({
        source: event.id,
        target: entityId,
      }))
    ),
  ];

  const simulation = forceSimulation(nodes)
    .force(
      "link",
      forceLink(links)
        .id((node) => (node as SimNode).id)
        .distance(90)
    )
    .force("charge", forceManyBody().strength(-260))
    .force("center", forceCenter(size / 2, size / 2))
    .stop();

  // Stepped to a settled state rather than animated: deterministic, and
  // therefore assertable.
  simulation.tick(ITERATIONS);

  const placed = new Map<string, PlacedNode>();
  for (const node of nodes) {
    placed.set(node.id, {
      entity: node.entity,
      ...(node.event === undefined ? {} : { event: node.event }),
      kind: node.kind,
      x: node.x ?? size / 2,
      y: node.y ?? size / 2,
    });
  }

  const edges: PlacedEdge[] = [];
  for (const relation of snapshot.relations) {
    const source = placed.get(relation.sourceId);
    const target = placed.get(relation.targetId);
    if (source !== undefined && target !== undefined) {
      edges.push({ id: relation.id, relation, source, target });
    }
  }
  for (const event of events) {
    const source = placed.get(event.id);
    for (const entityId of event.entityIds) {
      const target = placed.get(entityId);
      if (source !== undefined && target !== undefined) {
        edges.push({ id: `${event.id}->${entityId}`, source, target });
      }
    }
  }

  return { edges, nodes: [...placed.values()], omitted };
};

/** The span the graph covers, for driving a time control. */
export const extentRange = (
  snapshot: GraphSnapshot
): { readonly from: number; readonly to: number } | null => {
  const times: number[] = [];
  for (const entity of snapshot.entities) {
    const from = Date.parse(entity.temporalExtent.validFrom);
    const to = Date.parse(entity.temporalExtent.validTo);
    if (!Number.isNaN(from)) {
      times.push(from);
    }
    if (!Number.isNaN(to)) {
      times.push(to);
    }
  }
  if (times.length === 0) {
    return null;
  }
  return { from: Math.min(...times), to: Math.max(...times) };
};
