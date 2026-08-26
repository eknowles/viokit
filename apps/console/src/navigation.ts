import type { GlyphName } from "@viokit/ui";

/**
 * Where the console can be, and how to get there.
 *
 * These two lists have to agree, and until now they did not: `case` was a view
 * the console *opened on* with no entry in the rail, so clicking any icon left
 * it with no icon to come back to. The type said the view existed; nothing
 * said it was reachable.
 *
 * So they live in one file and are checked against each other in a test. A
 * view nobody can navigate to is not a view.
 */

export const VIEW_NAMES = [
  "case",
  "catalog",
  "launcher",
  "evidence",
  "graph",
  "canvas",
] as const;

export type ViewName = (typeof VIEW_NAMES)[number];

/** Where the console opens: the case workbench, which is the unit of work. */
export const DEFAULT_VIEW: ViewName = "case";

/**
 * A stored view name, or nothing.
 *
 * View state can be written by a different build of the console, and a name
 * that is no longer a view would otherwise fall through to whatever the render
 * treats as its default — landing the investigator somewhere they did not ask
 * for, with no indication that a preference was discarded.
 */
export const asViewName = (value: unknown): ViewName | null =>
  VIEW_NAMES.includes(value as ViewName) ? (value as ViewName) : null;

export interface ViewEntry {
  readonly icon: GlyphName;
  /** Tooltip and accessible name — the rail shows glyphs only. */
  readonly label: string;
  readonly name: ViewName;
  /** Lower-case pane header, in the design system's console voice. */
  readonly title: string;
}

/** The rail, in order. The case comes first: it is what the console is for. */
export const VIEWS: readonly ViewEntry[] = [
  { icon: "briefcase", label: "Case", name: "case", title: "case · workbench" },
  {
    icon: "library",
    label: "Catalog",
    name: "catalog",
    title: "source catalog",
  },
  {
    icon: "play",
    label: "Transform",
    name: "launcher",
    title: "transform launcher",
  },
  {
    icon: "file-search",
    label: "Evidence",
    name: "evidence",
    title: "evidence · manual acquisition",
  },
  { icon: "terminal", label: "Graph", name: "graph", title: "graph queries" },
  {
    icon: "git-fork",
    label: "Canvas",
    name: "canvas",
    title: "graph · canvas",
  },
];

/**
 * The keyboard shortcut for a view: its position in the rail.
 *
 * Digits rather than a modifier chord, because the modifier combinations that
 * would be conventional are all taken — the browser uses Cmd/Ctrl+1..9 to
 * switch tabs, and an app that fights the browser for a key loses. Plain
 * digits are free, provided the console does not steal them while someone is
 * typing, which is the caller's half of the bargain.
 */
export const shortcutOf = (name: ViewName): string =>
  String(VIEWS.findIndex((entry) => entry.name === name) + 1);

/** The view a key selects, or nothing if that key does not select one. */
export const viewForShortcut = (key: string): ViewName | null => {
  if (key.length !== 1 || key < "1" || key > "9") {
    return null;
  }
  return VIEWS[Number(key) - 1]?.name ?? null;
};

/**
 * Is the keystroke going somewhere that wants it?
 *
 * A shortcut that fires while someone is naming a seed would eat the
 * character and navigate away from what they were typing — the console must
 * not take a key out of a field.
 */
export const isTyping = (target: EventTarget | null): boolean => {
  // Duck-typed rather than `instanceof HTMLElement`: the whole job of this
  // function is inspecting an event target of unknown provenance, and the
  // instance check only bought a dependency on a live DOM — which made the
  // one piece of logic worth testing untestable.
  const node = target as {
    readonly isContentEditable?: unknown;
    readonly tagName?: unknown;
  } | null;
  if (node === null || typeof node !== "object") {
    return false;
  }
  return (
    node.isContentEditable === true ||
    (typeof node.tagName === "string" &&
      ["INPUT", "SELECT", "TEXTAREA"].includes(node.tagName))
  );
};
