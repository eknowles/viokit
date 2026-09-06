import type {
  Layout,
  NodeKind,
  PlacedEdge,
  PlacedNode,
} from "./graph-layout.js";

/**
 * The view model the graph renderer consumes.
 *
 * This module exists to collapse two renderers into one. The graph pane and the
 * case workbench were drawing the same `Layout` through two different sets of
 * CSS, so every fix had to be made twice and one copy quietly did not get it.
 * What actually differed between them was never the drawing — it was the
 * decoration — which classes a node carries, what its label reads, whether an
 * edge can be selected. So that is what this model takes as input and what the
 * renderer takes as data.
 *
 * It is deliberately plain: ids, positions, classes, and strings. That keeps it
 * assertable without a DOM (the console's tests have no browser environment),
 * and it is also the shape a graph library wants to be handed — `data`,
 * `classes`, `position` — so the renderer underneath can change without this
 * changing with it.
 */

/** What a node stands for. `seed` is not in the graph: it is what was typed. */
export type ViewNodeKind = NodeKind | "seed";

export interface GraphNodeView {
  readonly classes: readonly string[];
  readonly id: string;
  /** The *entity* kind — `domain`, `ip-address` — which drives presentation. */
  readonly kind: string;
  readonly label: string;
  /** What a node stands for, which is a different question to its kind. */
  readonly nodeKind: ViewNodeKind;
  readonly selectable: boolean;
  /** The accessible name: what a screen reader reads, and the hover title. */
  readonly title: string;
  readonly x: number;
  readonly y: number;
}

export interface GraphEdgeView {
  readonly classes: readonly string[];
  readonly id: string;
  readonly label?: string;
  readonly selectable: boolean;
  readonly source: string;
  readonly target: string;
  readonly title: string;
}

export interface GraphView {
  readonly edges: readonly GraphEdgeView[];
  readonly nodes: readonly GraphNodeView[];
}

/** What a selection refers to. Edges and nodes are told apart by the caller. */
export interface GraphPick {
  readonly id: string;
  readonly nodeKind?: ViewNodeKind;
  readonly type: "edge" | "node";
}

export interface NodeDecoration {
  readonly classes?: readonly string[];
  readonly label?: string;
  readonly title?: string;
}

export interface EdgeDecoration {
  readonly classes?: readonly string[];
  readonly label?: string;
  readonly selectable?: boolean;
  readonly title?: string;
}

export interface ViewOptions {
  readonly decorateEdge?: (edge: PlacedEdge) => EdgeDecoration;
  readonly decorateNode?: (node: PlacedNode) => NodeDecoration;
  /** Nodes that are not in the graph — the seed, which nothing has evidenced. */
  readonly extraNodes?: readonly GraphNodeView[];
}

/**
 * A node that stands for something typed rather than something found. It is
 * drawn hollow and dashed because no step asserts it yet; the moment a
 * transform does, the real node replaces it. That difference is the whole
 * provenance model in one shape, so it is built here rather than improvised at
 * the call site.
 */
export const seedNodeView = (
  id: string,
  label: string,
  at: { readonly x: number; readonly y: number }
): GraphNodeView => ({
  classes: ["vk-node--seed"],
  id,
  kind: "seed",
  label,
  nodeKind: "seed",
  selectable: true,
  title: `seed ${label}`,
  x: at.x,
  y: at.y,
});

/** Build the renderer's view of a laid-out graph. */
export const graphView = (
  placed: Layout,
  options: ViewOptions = {}
): GraphView => {
  const { decorateEdge, decorateNode, extraNodes = [] } = options;

  const nodes = placed.nodes.map((node): GraphNodeView => {
    const decoration = decorateNode?.(node) ?? {};
    const label = decoration.label ?? node.entity.id;
    return {
      classes: [`vk-node--${node.kind}`, ...(decoration.classes ?? [])],
      id: node.entity.id,
      kind: node.entity.kind,
      label,
      nodeKind: node.kind,
      selectable: true,
      title: decoration.title ?? `${node.entity.kind} ${label}`,
      x: node.x,
      y: node.y,
    };
  });

  const edges = placed.edges.map((edge): GraphEdgeView => {
    const decoration = decorateEdge?.(edge) ?? {};
    return {
      classes: decoration.classes ?? [],
      id: edge.id,
      ...(decoration.label === undefined ? {} : { label: decoration.label }),
      // An edge joining an event to a participant carries no relation, so
      // there is nothing to select and nothing to show if it were selected.
      selectable: decoration.selectable ?? edge.relation !== undefined,
      source: edge.source.entity.id,
      target: edge.target.entity.id,
      title: decoration.title ?? edge.relation?.type ?? "connection",
    };
  });

  return { edges, nodes: [...nodes, ...extraNodes] };
};

/** Every distinct entity kind in a view, in the order first seen. */
export const kindsInView = (view: GraphView): readonly string[] => [
  ...new Set(
    view.nodes
      .filter((node) => node.nodeKind !== "seed")
      .map((node) => node.kind)
  ),
];
