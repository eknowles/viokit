# TDR-027 — Graph camera, scale, and per-kind node rendering

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-26
- **Supersedes:** TDR-020 (graph rendering — layout library plus own renderer)
- **Related:** `openspec/exploration/04-web-ui.md` §4.2 (entity view specs) and §5 (4D canvas); TDR-002 (console stack); TDR-012 (view state, where the camera belongs); TDR-008 (build-small-over-adopt-heavy, argued the other way here); invariants I6, I8, I12

## Decision summary
> Adopt **Cytoscape.js** as the graph renderer: it brings the camera, hit-testing, and the
> hierarchical layouts the packs' tree-shaped data needs, on a canvas that carries roughly 10k nodes.
> Per-kind node presentation is expressed in Cytoscape's selector-based stylesheet — `node[kind=...]`
> with `background-image`, `label`, `shape`, and border — which is a close analogue of how `graph.css`
> already works and covers icons, thumbnails, and colours. The costs are accepted deliberately and
> named here: the graph's slice of the CSS design system is re-expressed in Cytoscape's stylesheet,
> and canvas rendering means accessibility is **rebuilt rather than inherited**. WebGL remains
> declined, for the reason that decided this whole document: per-kind node appearance.

## Context

TDR-020 chose `d3-force` for layout with a hand-written SVG renderer, read-only, capped at 200 nodes.
That was the right call for the graph displayed at the time — a handful of vertices — and it named its
own revisit conditions: *displayed graphs routinely exceeding what SVG handles*, or *interaction needs
(edge routing, compound nodes, hierarchical layouts) growing past what is reasonable to hand-roll*.

Four things have changed, and only one of them is the one TDR-020 expected.

- **There is no camera at all.** Both renderers draw into a fixed `viewBox="0 0 600 600"`. Not a slow
  camera — none. An investigator cannot pan or zoom, and the layout simply lands wherever it lands
  inside that box. This is now the top requirement, and it is not a rendering-technology problem: it
  is a missing feature that every candidate renderer supplies and the current one does not.
- **The 200-node cap binds in normal use.** `web-dns`'s `crt-sh-certificate-search` fans a domain into
  its subdomains, and `securitytrails-subdomains` does the same; each subdomain resolves to
  `ip-address` entities. A single expansion of a real domain routinely exceeds 200, so `capped()` fires
  as a matter of course and the honest "N omitted" banner becomes permanent furniture.
- **Per-kind node rendering is now required.** `04-web-ui.md` §4.2 specifies a per-entity-type view
  spec — display name, icon, colour/badge, **thumbnail field**. TDR-020 listed this as an open
  question and deferred it because no pack shipped one. It is now a stated requirement: nodes must be
  able to carry custom images, text, and styles that vary by entity kind.
- **The displayed graph is a forest, not a mesh.** Domain → subdomains → addresses is a tree, usually
  several of them, cross-linked where subdomains share an address. `forceSimulation` with
  `forceManyBody(-260)` and a single `forceCenter` renders that as a blob: the hierarchy the data has
  is not the hierarchy on screen, and disconnected components have nothing but the centring force
  holding them in frame. TDR-020's *hierarchical layouts* trigger is met; its *throughput* trigger,
  strictly, is not.

Two further facts constrain the choice.

- **The design system is CSS, deliberately.** `packages/ui/css/components/graph.css` is 215 lines that
  encode provenance semantics as style: a seed node is hollow and dashed because nothing has evidenced
  it yet, `--kept` carries a ring, `--deferred` is hollow, `--discarded` drops to 0.28 opacity because
  the entity is still in the log and hiding it would be a lie about the record, `--cat-N` fills a
  `--vk-node-cat` slot so a kind's colour is decided in data. Commit b5484d6 is named for this. A
  renderer that cannot consume CSS does not merely cost a rewrite; it discards the model.
- **Accessibility is currently free and would stop being.** Nodes carry `role="button"`,
  `tabIndex={0}`, `aria-pressed`, and `aria-label`; `:focus-visible` draws the ring; edges get a 10px
  transparent hit line over the 1.5px stroke because a hairline is not a click target. On a canvas
  every one of those is rebuilt by hand.

Also relevant: **two renderers exist.** `apps/console/src/views/GraphCanvas.tsx` (styled by the
console's own `.node`/`.edge` rules) and `CaseCanvas` inside `apps/console/src/views/Case.tsx` (styled
by `@viokit/ui`'s `.vk-node`/`.vk-edge`) both draw the same `Layout`. Whatever is chosen, there must be
one renderer at the end of it.

Constraints unchanged: the console decodes with `@viokit/schema` (I6), reaches the engine only through
the operation table (I8), and persists anything durable — the camera included — through the TDR-012
view-state store (I12).

## Options considered

### Option A — Keep SVG; hand-roll the camera and adopt a layout package
- **Description:** Add pan/zoom as a transform on a wrapping `<g>`, add `@dagrejs/dagre` or ELK for
  hierarchical layout, keep the hand-written SVG renderer and its CSS.
- **Pros:** Smallest change and the smallest dependency. Every CSS class and ARIA attribute survives
  untouched. Node rendering stays arbitrary, because a node is already JSX. Consistent with TDR-008's
  build-small instinct and with TDR-020's own reasoning.
- **Cons:** A camera is more work than it looks — wheel-zoom about the cursor, pinch, momentum, zoom
  limits, `fitView`, keeping selection and focus stable across transforms, and not fighting the
  browser's own gesture handling. This is exactly the "genuinely hard part worth buying" argument
  TDR-020 made about force layout, applied to a different part of the problem. Raw SVG also has no
  viewport culling, so the node ceiling stays around a thousand with no headroom.

### Option B — React Flow (`@xyflow/react`) + a hierarchical layout package  ← *runner-up; see Analysis for what C trades against it*
- **Description:** React Flow owns the camera, hit-testing, selection, and viewport culling. It does
  **not** own layout: positions are supplied, which is precisely the interface `layout()` already
  exposes. Nodes are registered as `nodeTypes` — ordinary React components.
- **Pros:** Best-in-class camera, which is the top requirement. A custom node is a React component, so
  per-kind images, text, and styles are trivially arbitrary and the entire `graph.css` design system
  applies verbatim — this is the only option where that is true. `role`/`aria`/`:focus-visible` survive
  because nodes remain DOM. Slots into the existing layout/render seam without disturbing `atTime`,
  `capped`, or the temporal filter. MIT, 12.x, heavily maintained. Precedent exists: `@tanstack/react-table`
  was adopted on the same reasoning — buy the hard interaction machinery, keep our own presentation.
- **Cons:** Nodes are DOM, so the comfortable ceiling is roughly 1,500 and hard past ~3,000 — headroom,
  not unlimited scale. The library's model comes from node editors, so edges assume handles/ports;
  investigation graphs want free-floating edges, a documented pattern but off the paved path. It brings
  its own store and internal state, which sits beside the console's Effect atoms (TDR-002).

### Option C — Cytoscape.js  ← **chosen**
- **Description:** A complete graph toolkit: canvas renderer, camera, many layouts (including
  `breadthfirst` and dagre/ELK bindings), compound nodes, its own stylesheet language.
- **Pros:** Canvas rendering takes the ceiling to roughly 10k. Hierarchical and tree layouts are
  first-class and built in. Mature, MIT, stable for over a decade. Compound nodes are a real answer if
  grouping by kind or by expansion ever matters.
- **Cons:** Per-kind appearance is expressible only in Cytoscape's stylesheet vocabulary —
  `background-image`, `label`, `shape`, `border-*`. That covers icons and colours but not arbitrary
  node content, and `graph.css` would be rewritten into a different language and maintained twice.
  Accessibility is rebuilt. TDR-020's original objection stands: it sits beside React's model rather
  than inside it, and its opinions about selection and styling are adopted wholesale.

### Option D — `graphology` + `sigma` (WebGL)
- **Description:** A graph data structure plus a WebGL renderer built for scale. The original instinct
  behind this TDR.
- **Pros:** Tens of thousands of nodes at frame rate, comfortably beyond anything foreseeable here.
  Excellent camera. The only option that makes genuine visual effects — glow, bloom, depth, animated
  edges — cheap. MIT.
- **Cons:** **It is worst at the requirement that motivated the change.** Custom per-kind node
  appearance means writing node programs and packing a texture atlas; `@sigma/node-image` handles icons
  but not arbitrary content, and labels render on a separate 2D overlay. Every CSS rule in `graph.css`
  becomes imperative draw code or shader uniforms. Accessibility is a parallel DOM tree maintained by
  hand. Hierarchical layout support is weak — ForceAtlas2 is the strength, and trees are the shape we
  have. Buys a scale nobody has asked to display at the cost of the two things that were asked for.

### Option E — AntV G6 v5
- **Description:** Canvas/WebGL renderer with a rich composable node model and a broad layout catalogue
  (`compact-box`, `dendrogram`, `mindmap`, force, radial).
- **Pros:** Genuinely strong per-kind node rendering for a non-DOM renderer — nodes are composed from
  shapes and images rather than selected from a fixed set. Best-in-class tree layouts. Good scale. MIT.
- **Cons:** Owns data model, layout, rendering, and interaction together, which is the largest adoption
  on the list; the React binding is a wrapper rather than a native model. Node appearance is still
  imperative rather than CSS. Documentation and ecosystem gravity are weaker in this codebase's
  language. Accessibility rebuilt.

## Evaluation criteria
1. **Camera quality** — pan/zoom is the stated top requirement
2. **Per-kind node rendering** — arbitrary images, text, and styles by entity kind (§4.2 view specs)
3. **Whether the CSS design system survives** — `graph.css` as the encoding of provenance semantics
4. **Interaction and accessibility cost** — what has to be rebuilt
5. **Layout fit** — hierarchical and forest-shaped graphs, not meshes
6. **Scale headroom against the graph actually displayed**, not the store's ceiling (TDR-005's 200k
   vertices remains not the renderer's requirement)
7. **Licensing and supply-chain risk**
8. **Fit with the existing `atTime`/`capped`/`layout` seam and with React + Effect**
9. **Cost of changing course again**

## Analysis

- **Criteria 2 and 3 are what this decision trades, and the trade is the point.** The requirement that
  raised the whole question — nodes showing custom images, text, and styles per entity kind — is met by
  Cytoscape's stylesheet, but met *in Cytoscape's vocabulary*. `node[kind="domain"] { background-image:
  ...; label: data(name) }` is a selector-based, data-driven rule, which is structurally the same idea
  as `graph.css`'s `--vk-node-cat` slot: a kind's appearance decided in data, with the styling layer
  knowing nothing about domains or addresses. The semantics of the design system therefore survive.
  The *file* does not: the graph's node and edge rules are re-expressed in a second language and
  maintained there. That is a real cost and it is accepted, not waved past.
  What is genuinely given up is *arbitrary* node content — a node is an image, a label, a shape, and
  borders, not composable markup. For the view specs `04-web-ui` §4.2 actually describes (display name,
  icon, colour/badge, thumbnail) that is sufficient; for a node that must contain a small table or a
  sparkline it is not, and `cytoscape-node-html-label` would be the escape hatch, at the cost of
  reintroducing a DOM overlay.
- **Criterion 4 is where the bill comes due, and it is the largest single cost of this decision.**
  Canvas has no DOM, so `role="button"`, `tabIndex`, `aria-pressed`, `:focus-visible`, and the 10px
  transparent edge hit-line are not adapted — they are gone, and a replacement is built. Cytoscape
  ships no accessibility layer. The workable pattern is a parallel, visually-hidden DOM structure
  mirroring nodes and edges, synchronised with the canvas, carrying focus and announcing selection.
  That is a piece of work, and the honest framing is that this decision *buys scale and layouts with
  accessibility budget*. It is therefore specified as an outcome rather than a mechanism, and tested.
- **Criteria 1 and 5 are where Cytoscape is unambiguously strong, and 5 was underrated earlier.** The
  camera is mature and complete. More importantly, **`breadthfirst` and `concentric` are in the core**,
  so the hierarchical layout the packs' forests need arrives with no extra package, no extra licence
  question, and no integration seam. The alternative recommendation needed a separate layout dependency
  to reach the same place. `cose`/`fcose` remain available for genuinely cross-linked graphs.
- **Criterion 6 stops being a constraint.** Canvas rendering carries roughly 10k nodes against the DOM's
  ~1,500. That does not mean 10k should be *displayed* — the readability limit is lower than the render
  limit and the cap survives for that reason — but it removes the risk that the measurement in the
  change's task 0.3 invalidates the renderer. Whatever a large `crt-sh` expansion turns out to produce,
  this renderer carries it. That converts a gating measurement into a tuning one.
- **Criterion 7 produced two findings.** First, **`cytoscape` core has no dependencies at all** and is
  MIT — an unusually clean supply-chain position for a library of its scope. Second, and more useful:
  **`cytoscape-elk` is MIT but declares `elkjs` as a direct dependency**, and elkjs is `EPL-2.0 OR
  GPL-3.0-or-later`. An MIT wrapper does not change the licence of the code that ships. This is exactly
  the transitive acquisition this document warned about one option earlier, and it would have been easy
  to miss by reading the wrapper's licence field. `cytoscape-dagre` (4.0.0, MIT) and `cytoscape-fcose`
  (2.2.0, MIT → `cose-base`) are clean, and the core layouts need neither.
- **Criterion 8 is preserved, and deliberately.** Cytoscape *can* own layout, but it does not have to:
  its `preset` layout takes supplied positions. The `atTime` → `capped` → `layout` seam therefore
  survives intact, and using Cytoscape's own layouts becomes a choice made per graph rather than a
  collapse of the pipeline. This matters more than it sounds — the seam is what made the present
  decision cheap, and giving it up to a toolkit that offered an alternative would have been careless.
- **Criterion 9 is the one that weakens.** Re-expressing the stylesheet and building an accessibility
  layer are costs that do not transfer to a third renderer. Changing course again would be materially
  more expensive than changing course was this time. That is the price of adopting a toolkit rather
  than a component, and it argues for treating this as settled for a good while.
- **Option D remains declined on its own motivating requirement.** Nothing about choosing a canvas
  renderer revives the WebGL case: per-kind appearance in sigma is still a texture atlas and node
  programs. Cytoscape reaches most of WebGL's scale while keeping node presentation declarative.

## Recommendation

- **Option C — Cytoscape.js.** Camera, hit-testing, rendering, and layout in one mature MIT dependency
  with no transitive dependencies of its own.
- **Hierarchical layout comes from the core** (`breadthfirst`, with `concentric` and `cose`/`fcose`
  available), so no layout package is adopted and the ELK licensing question is avoided entirely.
  **`cytoscape-elk` is not adopted** without explicitly accepting EPL-2.0/GPL-3.0-or-later, since the
  MIT wrapper does not change what ships.
- **Keep the layout seam.** `atTime` and `capped` continue to run before anything is handed to the
  renderer, and `preset` remains available so supplied positions stay a first-class path. Which layout
  runs is a per-graph choice, named in the UI.
- **Per-kind presentation is a Cytoscape stylesheet driven by entity data**, resolved by kind with a
  generic fallback that renders an unknown kind honestly as an unknown kind. Colours and typography
  continue to come from the `@viokit/ui` design tokens — the token layer is shared even though the rule
  syntax is not, so the graph does not drift from the rest of the console.
- **Accessibility is rebuilt, specified as an outcome, and tested.** Keyboard operability, an exposed
  selection state, a visible focus indication, and labels naming the entity. This is the acknowledged
  cost of the decision, so it is a work item with tests rather than a hope.
- **Raise the cap; keep the truncation message.** The bound becomes a measured, named configuration
  value and `capped()` continues to retain the highest-degree entities and to say what it omitted. The
  readability limit is lower than the render limit, which is why the cap survives a 10k-capable
  renderer.
- **The camera is view state** through the TDR-012 store (I12), keyed by investigation.
- **Collapse to one renderer.** `GraphCanvas.tsx` and `CaseCanvas` both go.
- **Still no streaming.** TDR-003 remains deferred.
- **What would change this decision:** node content needing to be genuinely arbitrary — markup, nested
  controls, live sub-views — which Cytoscape's stylesheet cannot express and which would force either
  `cytoscape-node-html-label` or a DOM renderer after all; or the accessibility layer proving
  unworkable over canvas, which would make the DOM's free affordances worth their lower ceiling.

## Findings (implementation, 2026-08-26)

Recorded here because each contradicts or extends the analysis above, and a decision
document that only says what was predicted is less useful than one that says what happened.

- **The licence trap was real, and the wrapper hid it.** `cytoscape-elk` declares MIT in its own
  manifest and `elkjs` (`EPL-2.0 OR GPL-3.0-or-later`) in its `dependencies`. Reading the wrapper's
  licence field at face value would have pulled copyleft into the browser bundle. Not adopted; the
  core's `breadthfirst` removed the need entirely. `cytoscape@3.34.1` was confirmed from the
  lockfile to have **zero dependencies and zero peer dependencies**.
- **The bundle cost was never priced, and it is the largest thing this analysis missed.**
  `cytoscape.esm.min.mjs` is 434 KB minified, ~134 KB gzipped; the console's JS went from roughly
  400 KB to **822 KB (261 KB gzipped)**, so Cytoscape is about half the bundle. For a desktop
  investigation console this is acceptable and it does not reopen the decision — but criterion 2
  should have weighed it, and did not.
- **Edge hit-testing came out better than what it replaced.** Cytoscape hits edges at
  `width / 2 + edgeThreshold`, `edgeThreshold = (isTouch ? 24 : 8) / zoom` — a 17.5px target with a
  mouse against the 10px transparent fat line the SVG renderer needed. One accepted cost that was
  not a cost.
- **`breadthfirst` is deterministic**, verified headlessly on a two-root forest with shared leaves:
  12 nodes, **0 coincident pairs**, 3 distinct y-levels, and byte-identical positions across runs.
  The feared forest-packing problem did not materialise, and the determinism the `graph-layout`
  tests depend on is preserved without pinning a seed. `concentric` was tried and rejected.
- **The accessibility layer was cheaper than assumed, for one specific reason.** Deriving the
  hidden mirror from the *same view model* that produces the drawing — rather than synchronising it
  to the canvas — means the two cannot disagree, and makes the whole layer assertable without a
  browser. The analysis was right that it is built rather than inherited, and wrong that it is
  necessarily "a project". **Caveat: not verified with a real screen reader**, which needs a human.
  Tab order is also the wrong navigation model at a thousand nodes; a roving-tabindex listbox is
  the known fix and is noted against the task that raises the bound.
- **The measurement partly contradicts the change that motivated it.** A real `crt-sh` expansion of
  `stripe.com` projects to **188 entities at one hop — under the old 200 bound**. The proposal's
  claim that the cap "binds in ordinary use" holds at two hops, not one. The bound was set to 1000
  on that basis. crt.sh 502'd for five of six domains attempted, so this is one data point and
  should be re-run.
- **`graph.css` survived more than expected, and one deletion was nearly a bug.** The `--vk-node-cat`
  slot rules are read by the DOM legend, not only by the canvas; removing them with the rest of the
  node styling would have left every legend swatch the same grey — the "colour encoding nobody can
  decode" failure the legend exists to prevent. The boundary is: appearance moved, slot definitions
  and all DOM chrome stayed.

## Open questions
- **What is the real bound?** *Partly answered* — 188 entities at one hop on one domain, bound set to
  1000. Needs re-running across several domains when crt.sh is healthy, and measuring at two hops,
  which is where the cap actually starts to bind.
- **Which core layout for forests?** *Answered:* `breadthfirst`, with no packing problem observed.
- **How much of `graph.css` moves, and does anything stay?** *Answered* — see Findings. The
  `--vk-node-cat` slot rules stay, because the DOM legend reads them.
- **Do design tokens reach the Cytoscape stylesheet cleanly?** Reading CSS custom properties from
  `getComputedStyle` at stylesheet construction works but must re-run on theme change; otherwise the
  graph keeps the old theme's colours after a dark/light switch.
- **What is the accessibility mechanism?** *Answered:* a hidden mirror derived from the shared view
  model. Still open: verification with a real screen reader, and arrow-key navigation at scale.
- **Are view specs declared by packs or mapped in the console?** Unchanged by the renderer choice.
- **Does the map pane share this substrate?** `04-web-ui` §5 wants graph + map + timeline; a map on
  deck.gl or MapLibre would be a third rendering technology in one console. TDR-020's still-open
  question about a shared selection model applies with more force now.
- **Determinism.** `breadthfirst` and `preset` are deterministic; `cose`/`fcose` are not without a fixed
  seed. The `graph-layout` tests depend on settled, reproducible positions, so any force layout used
  here needs its randomness pinned.

## References
- TDR-020 (superseded by this document)
- `cytoscape` 3.34.1 (MIT, no dependencies); `cytoscape-dagre` 4.0.0 (MIT); `cytoscape-fcose` 2.2.0
  (MIT); `cytoscape-elk` 2.3.0 — MIT wrapper, **`elkjs` EPL-2.0 OR GPL-3.0-or-later underneath**
- `openspec/exploration/04-web-ui.md` §4.2 (entity view specs), §5 (graph/map/timeline panes)
- TDR-005 (store scale — deliberately *not* the renderer's requirement, restated here)
- TDR-008 (build-small-over-adopt-heavy; argued the other way for the camera, for the reason TDR-020
  gave about force layout)
- TDR-012 (view state, where the camera belongs)
- `apps/console/src/graph-layout.ts` (`atTime`, `capped`, `layout` — the seam this preserves)
- `packages/ui/css/components/graph.css` (the design system this preserves)
