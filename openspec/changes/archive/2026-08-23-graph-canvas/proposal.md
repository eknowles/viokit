# Graph Canvas

## Why

The console can drive the engine and cannot show what it produced. Every result — a replayed investigation, a relatedness ranking, a path — arrives as a table, which is a poor way to look at a graph and a hopeless way to see a graph that changes over time. The whole premise of the tool is a 4D graph; the interface renders none of it.

Everything needed is already there. `replay` returns entities, relations, and events; every entity and relation carries a temporal extent, so the time dimension is in the data rather than something to invent. TDR-020 settles how to draw it, and TDR-012's view-state store means camera and selection can persist properly rather than being lost on reload.

## What Changes

- **A graph pane in the console** rendering the replayed graph: entities as nodes, relations as edges, laid out by force simulation and drawn as SVG.
- **A time filter** driven by the temporal extents already on the data, so an investigator can see the graph as it stood at a moment rather than all at once.
- **Selection shows provenance** — choosing a node reveals what it is and, for a relation, what connects it, so the graph is a way into the evidence rather than a picture beside it.
- **An explicit cap on rendered nodes** with a visible message when it truncates. A graph view that silently shows a subset would read as the whole graph, which for an investigation tool is the worst failure available.
- **Camera and selection persist as view state** through the existing store (I12), not in the browser.

Not in this change: map and timeline panes, live updates (TDR-003), editing the graph from the canvas, and pack-provided node styling (`04-web-ui.md` §4.2 — no pack ships a view spec yet).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `console`: gains a graph view that renders the graph and its time dimension, with selection and truncation reported honestly.

## Impact

- `apps/console`: a graph view, a force-layout hook over `d3-force`, an SVG renderer, and a time filter; the graph's camera, selection, and time position join the persisted view state.
- Dependency: `d3-force` (layout only — the renderer is ours, per TDR-020).
- Tests: layout is deterministic for a given input; the time filter includes and excludes by temporal extent correctly; truncation reports what it dropped; view state round-trips.
- No engine or front-end changes — the canvas renders what `replay` already returns.
