import type { StylesheetStyle } from "cytoscape";
import { SLOTS } from "./view-spec.js";

/**
 * The graph's stylesheet, derived from the design tokens.
 *
 * Cytoscape draws to a canvas, so the node and edge rules that used to live in
 * `graph.css` cannot apply — a canvas has no DOM to cascade over. They are
 * re-expressed here in Cytoscape's selector vocabulary, which is the same idea
 * in different syntax: a kind's appearance is decided from data
 * (`node[kind = "domain"]`) exactly as `--vk-node-cat` decided it from a slot.
 *
 * **The colours are read from the tokens, never written here.** Two stylesheet
 * languages describing one design system is the drift risk this change accepts,
 * and a literal colour in this file is how that drift would start. The token
 * reader is injected so this module is assertable without a browser, and so the
 * caller can rebuild it when the theme changes — a stylesheet built once holds
 * the previous theme's colours forever, which would make the graph the one
 * surface that did not follow.
 */

/** Reads a CSS custom property. Injected so this is testable without a DOM. */
export type TokenReader = (name: string) => string;

const NODE_SIZE = 14;
const SELECTED_WIDTH = 2.5;
const LABEL_GAP = 8;
const LABEL_PAD = "3px";
/** Below this rendered size a label is illegible anyway, so it is not drawn. */
const MIN_LABEL_PX = 7;

/**
 * Provenance, as weight. Kept is solid and ringed; deferred is hollow — a
 * decision to come back to it; discarded fades but does NOT disappear, because
 * the entity is still in the log and pretending otherwise would be a lie about
 * the record.
 */
export const graphStylesheet = (token: TokenReader): StylesheetStyle[] => {
  const colour = (name: string, fallback: string) => token(name) || fallback;

  const base: StylesheetStyle[] = [
    {
      selector: "node",
      style: {
        "background-color": colour("--vk-tool-node", "#ffffff"),
        "border-color": colour("--vk-tool-meta", "#64748b"),
        "border-width": 1.5,
        color: colour("--vk-tool-meta", "#64748b"),
        "font-family": colour("--vk-font-mono", "monospace"),
        "font-size": 10,
        height: NODE_SIZE,
        label: "data(label)",
        // Zoomed far out, labels become unreadable mush that hides the shape
        // of the graph. Below this they are dropped and the structure shows.
        "min-zoomed-font-size": MIN_LABEL_PX,
        /*
         * A label crossing an edge or another node has to stay readable, so it
         * carries the surface colour behind it rather than relying on the
         * layout never producing a crossing. The layout spaces for labels too
         * (`footprint` in graph-layout); this is what covers the rest, since
         * no force layout guarantees clearance.
         */
        "text-background-color": colour("--vk-tool-surface", "#ffffff"),
        "text-background-opacity": 0.82,
        "text-background-padding": LABEL_PAD,
        "text-background-shape": "roundrectangle",
        "text-halign": "right",
        "text-margin-x": LABEL_GAP,
        "text-valign": "center",
        width: NODE_SIZE,
      },
    },
    {
      selector: "edge",
      style: {
        "curve-style": "straight",
        "line-color": colour("--vk-graph-edge", "#7d8ea6"),
        width: 1.5,
      },
    },
  ];

  /*
   * State beats kind: a discarded node is hollow whatever kind it is, and a
   * seed is dashed whatever it stands for. Ordered after the category colours
   * for that reason — Cytoscape resolves later rules over earlier ones.
   */
  const states: StylesheetStyle[] = [
    // An event is the graph's time dimension, not another entity.
    {
      selector: "node.vk-node--event",
      style: {
        "background-color": colour("--vk-tool-track", "#e2e8f0"),
        "border-color": colour("--vk-tool-dim", "#94a3b8"),
      },
    },
    /*
     * The seed is what you typed. It is NOT in the graph — nothing has
     * evidenced it yet — so it is drawn hollow and dashed. The moment a
     * transform asserts it, the real evidenced node replaces it and the dashes
     * go away. That difference is the whole provenance model in one visual.
     */
    {
      selector: "node.vk-node--seed",
      style: {
        "background-opacity": 0,
        "border-color": colour("--vk-accent", "#f59e0b"),
        "border-style": "dashed",
        color: colour("--vk-accent-text", "#78350f"),
      },
    },
    {
      selector: "node.vk-node--kept",
      style: {
        "border-color": colour("--vk-ok", "#15803d"),
        "border-width": SELECTED_WIDTH,
      },
    },
    {
      selector: "node.vk-node--deferred",
      style: { "background-opacity": 0, "border-style": "dashed" },
    },
    {
      selector: "node.vk-node--discarded",
      style: { "background-opacity": 0, opacity: 0.28 },
    },
    // Edges into a discarded node fade with it.
    { selector: "edge.vk-edge--muted", style: { opacity: 0.25 } },
    {
      selector: "node.is-selected",
      style: {
        "background-color": colour("--vk-accent", "#f59e0b"),
        "border-color": colour("--vk-accent-strong", "#d97706"),
        "border-width": SELECTED_WIDTH,
        color: colour("--vk-tool-text", "#0f172a"),
      },
    },
    {
      selector: "edge.is-selected",
      style: {
        "line-color": colour("--vk-accent-strong", "#d97706"),
        width: 3,
      },
    },
    // Keyboard focus. The canvas cannot show a CSS focus ring, so focus is
    // drawn: without this, keyboard navigation would be invisible.
    {
      selector: "node.is-focused",
      style: {
        "border-color": colour("--vk-accent-strong", "#d97706"),
        "border-width": SELECTED_WIDTH,
        "overlay-color": colour("--vk-accent", "#f59e0b"),
        "overlay-opacity": 0.25,
        "overlay-padding": 6,
      },
    },
    {
      selector: "edge.is-focused",
      style: {
        "line-color": colour("--vk-accent-strong", "#d97706"),
        "overlay-color": colour("--vk-accent", "#f59e0b"),
        "overlay-opacity": 0.25,
        "overlay-padding": 4,
        width: 3,
      },
    },
  ];

  /*
   * Entity kind, as colour. The slot is decided in data by the caller, so a
   * kind's colour is settled once and not encoded per kind in a stylesheet
   * that could not know what kinds a pack will bring (the open-domain rule).
   */
  const categories: StylesheetStyle[] = Array.from(
    { length: SLOTS },
    (_, index) => {
      const slot = index + 1;
      const value = colour(`--vk-cat-${slot}`, "#64748b");
      return {
        selector: `node.vk-node--cat-${slot}`,
        style: { "background-color": value, "border-color": value },
      };
    }
  );

  return [...base, ...categories, ...states];
};

/** Reads design tokens off an element. The browser's half of `TokenReader`. */
export const tokensFrom = (element: Element): TokenReader => {
  const computed = getComputedStyle(element);
  return (name: string) => computed.getPropertyValue(name).trim();
};
