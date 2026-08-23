# Tasks — Graph Canvas

> Prereq: TDR-020 `decided`. Consumes `replay`; no engine changes.

## 1. Layout

- [x] 1.1 Add `d3-force`; a layout function stepping the simulation to a settled state and returning positions.
- [x] 1.2 Tests: deterministic for a given input; disconnected nodes still placed; empty input yields empty output.

## 2. Filtering and bounding

- [x] 2.1 A time filter over temporal extents, applied *before* layout so the result is laid out for what is visible.
- [x] 2.2 An entity cap, keeping the most-connected; relations kept only where both endpoints survive.
- [x] 2.3 Report what was omitted.
- [x] 2.4 Tests: inclusion and exclusion at extent boundaries; no time selected shows everything; truncation reports its count; a graph within the bound reports nothing.

## 3. The pane

- [x] 3.1 SVG renderer: nodes, edges, labels, selection.
- [x] 3.2 A time control driven by the graph's own extent range.
- [x] 3.3 Selecting a node shows its kind, identifiers, and temporal extent; selection can be cleared.
- [x] 3.4 An empty graph says so rather than rendering a blank canvas.

## 4. View state

- [x] 4.1 Camera, selection, and time position join the console's persisted payload; bump its version.
- [x] 4.2 Test: the graph's view state round-trips, and an old document degrades to defaults.

## 5. Verification

- [x] 5.1 Typechecks, suites, lint clean via devbox.
- [x] 5.2 Drive it against a live API: commit a transform's steps, open the graph, see them, filter by time.
- [x] 5.3 Invariant checklist, with I12 and I8 called out.
