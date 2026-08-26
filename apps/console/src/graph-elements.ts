import type { ElementDefinition } from "cytoscape";
import type { GraphEdgeView, GraphNodeView, GraphView } from "./graph-view.js";

/**
 * The view model as Cytoscape elements.
 *
 * Kept as a pure function so the translation is assertable without a browser:
 * the console's tests have no DOM, and "does the renderer get the right data"
 * is exactly the question worth answering without one.
 *
 * Positions come from `layout()` and are handed over as they are — Cytoscape is
 * given `preset` so it places what it is told rather than computing its own.
 * That keeps `atTime` → `capped` → `layout` the one pipeline, instead of the
 * renderer quietly growing a second.
 */
export const graphElements = (view: GraphView): ElementDefinition[] => [
  ...view.nodes.map(
    (node: GraphNodeView): ElementDefinition => ({
      classes: node.classes.join(" "),
      data: {
        id: node.id,
        kind: node.kind,
        label: node.label,
        nodeKind: node.nodeKind,
        selectable: node.selectable,
        title: node.title,
      },
      group: "nodes",
      position: { x: node.x, y: node.y },
    })
  ),
  ...view.edges.map(
    (edge: GraphEdgeView): ElementDefinition => ({
      classes: edge.classes.join(" "),
      data: {
        id: edge.id,
        ...(edge.label === undefined ? {} : { label: edge.label }),
        selectable: edge.selectable,
        source: edge.source,
        target: edge.target,
        title: edge.title,
      },
      group: "edges",
    })
  ),
];

/**
 * What assistive technology and the keyboard actually navigate.
 *
 * A canvas has no DOM, so none of `role`, `tabIndex`, `aria-pressed`, or a
 * focus ring survives the move off SVG. This is the replacement: an ordered,
 * visually-hidden mirror of everything on the canvas, derived from the same
 * view model that produced the drawing. Deriving both from one source is the
 * point — a mirror maintained separately is a mirror that goes stale, and a
 * stale accessibility tree is worse than none because it lies confidently.
 *
 * Only selectable items appear: an edge joining an event to a participant is
 * not a control, and offering it as one would be noise in a keyboard walk.
 */
export interface MirrorItem {
  readonly id: string;
  readonly kind: "edge" | "node";
  /** What a screen reader reads. */
  readonly title: string;
}

export const mirrorItems = (view: GraphView): readonly MirrorItem[] => [
  ...view.nodes
    .filter((node) => node.selectable)
    .map(
      (node): MirrorItem => ({ id: node.id, kind: "node", title: node.title })
    ),
  ...view.edges
    .filter((edge) => edge.selectable)
    .map(
      (edge): MirrorItem => ({ id: edge.id, kind: "edge", title: edge.title })
    ),
];
