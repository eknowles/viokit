# TDR-020 — Graph rendering: layout library plus own renderer vs a graph toolkit

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** `openspec/exploration/04-web-ui.md` §5 (4D visualization); TDR-002 (console stack); TDR-008 (the same build-small-over-adopt-heavy reasoning); TDR-012 (view state, which now exists); TDR-003 (streaming, `proposed` — not required here); invariants I6, I8, I12

## Decision summary
> Use **`d3-force` for layout and render to SVG ourselves**, in a read-only canvas with a time filter. A graph toolkit (Cytoscape, sigma) is deferred until the displayed graph outgrows SVG, at which point the renderer is the only piece that changes.

## Context
- The console can drive the engine but only shows tables. `04-web-ui.md` §5 describes the intended surface — a graph pane with a time scrubber, a map pane, a timeline pane — and none of it exists.
- What there is to render is settled: `replay` returns a `GraphState` of `entities`, `relations`, and `events`, and every entity and relation carries a `temporalExtent`. The time dimension is therefore already in the data, not something to invent.
- Scale is bimodal. The TDR-005 spike showed the *store* handling 200k vertices and 1.2M edges, but a *displayed* investigation graph — a relatedness result, a path, a replayed case — is orders of magnitude smaller. Designing the renderer for the store's ceiling would be designing for the wrong number.
- Constraints: the console decodes with `@viokit/schema` (I6) and reaches the engine only through the operation table (I8); anything persisted is view state and must go through the TDR-012 store (I12), which now exists.
- Streaming (TDR-003) is **not** required: a static render of a replayed graph needs no live updates.

## Options considered

### Option A — `d3-force` for layout, own SVG renderer
- **Description:** `d3-force` computes positions; the console renders nodes and edges as SVG and owns interaction, styling, and the time filter.
- **Pros:** Takes the genuinely hard part (force-directed layout with velocity Verlet integration) and leaves the easy, opinionated part to us. Small and tree-shakeable, with no DOM assumptions — it is a maths library. SVG nodes are ordinary DOM, so styling, hit-testing, and accessibility come free rather than being reimplemented on a canvas. Fits the console's existing zero-UI-dependency shape.
- **Cons:** We write the renderer, the camera, and the interaction. SVG degrades past roughly a thousand nodes, so a large graph needs an answer (see decision 3).

### Option B — Cytoscape.js
- **Description:** A complete graph toolkit: layouts, rendering, interaction, styling.
- **Pros:** Everything included and mature; many layout algorithms; well-documented interaction model.
- **Cons:** Large dependency with its own styling language and event model, sitting beside React rather than inside it. We would adopt its opinions about selection and layout to render a graph whose semantics — temporal extents, evidence attribution — it knows nothing about. Most of what it offers is the part we do not need help with.

### Option C — `graphology` + `sigma` (WebGL)
- **Description:** A graph data structure plus a WebGL renderer built for scale.
- **Pros:** Handles tens of thousands of nodes smoothly; the right answer at the store's ceiling.
- **Cons:** WebGL rendering means custom hit-testing, custom labels, and no DOM — every affordance SVG gives free is rebuilt. Premature for a graph that is currently a handful of vertices, and it would front-load the cost of a scale we have no evidence of displaying.

### Option D — Hand-roll the layout too
- **Description:** No dependency; implement force simulation ourselves.
- **Pros:** Zero dependencies, complete control.
- **Cons:** Force-directed layout done badly looks broken, and done well is a real piece of numerical work with tuning we would rediscover from scratch. This is the one part of the problem worth buying.

## Evaluation criteria
1. Fit with the graph actually displayed today, not the store's ceiling
2. What is bought versus what is adopted — dependency weight against work saved
3. Interaction, styling, and accessibility cost
4. Cost of changing course when the displayed graph grows
5. Fit with the console's existing shape (React, Effect, shared schema)

## Analysis
- **Criterion 2 is the whole argument, and it cuts in opposite directions for A and D.** Layout is the part where a library earns its place; rendering and interaction are where an opinionated library starts costing more than it saves. A buys exactly the first and keeps the second. D declines the one thing worth buying.
- **Criterion 1 rules out C for now.** WebGL is the correct answer at 50k nodes and an expensive one at 50. The store's benchmark is not the renderer's requirement, and conflating them would be designing for a number nobody has seen on screen.
- **Criterion 3 favours A strongly.** SVG nodes are DOM: hover, focus, click, CSS, and screen-reader affordances work without reimplementation. On a WebGL canvas each of those is a project.
- **Criterion 4 is what makes A safe rather than merely cheap.** The layout/render split means positions are computed independently of how they are drawn — swapping SVG for canvas or sigma later touches the renderer alone, and `d3-force` stays either way.
- **B loses on criteria 2 and 5 together**: it is the largest adoption for the smallest saving, and it sits alongside React's model rather than within it.

## Recommendation
- **Option A.** `d3-force` for layout, own SVG renderer, read-only to begin with: nodes, edges, labels, selection, and a time filter driven by the temporal extents already on the data.
- **Explicit node cap with a visible message.** SVG degrades past roughly a thousand nodes, so the canvas renders up to a bound and *says* when it has truncated. Silent truncation would read as "this is the whole graph", which for an investigation tool is the worst possible failure.
- **Camera and selection are view state** and persist through the TDR-012 store (I12), not `localStorage`.
- **No streaming.** The canvas renders a replayed graph on demand; live updates wait for TDR-003.
- **What would change this decision:** displayed graphs routinely exceeding what SVG handles, at which point the renderer swaps to canvas or sigma behind the same layout; or interaction needs (edge routing, compound nodes, hierarchical layouts) growing past what is reasonable to hand-roll, which is when Cytoscape becomes the cheaper option.

## Open questions
- Whether the map and timeline panes reuse this renderer's selection model or own their own. Deferred until a second pane exists; the answer is obvious once there is something to share with.
- How pack-provided view specs (`04-web-ui.md` §4.2 — icons, colours, labels per entity type) feed node styling. Deferred: no pack ships one yet, and the generic renderer must work without them regardless.

## References
- `openspec/exploration/04-web-ui.md` §5 (graph, map, timeline panes)
- TDR-005 spike (store scale, deliberately *not* the renderer's requirement)
- TDR-008 (build-small-over-adopt-heavy, same reasoning applied to forms)
- TDR-012 (view state, where camera and selection belong)
