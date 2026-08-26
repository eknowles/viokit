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
