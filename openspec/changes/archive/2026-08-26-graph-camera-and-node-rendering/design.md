## Context

TDR-020 built a seam that has now paid for itself: `replay` → `atTime` → `capped` → `layout` produces
positions, and rendering consumes them. Layout does not know how the graph is drawn, and the renderer
does not know how positions were reached. Preserving that split is the first constraint on everything
below — and it is preservable, because Cytoscape's `preset` layout accepts supplied positions.

What sits on the other side of that seam is weaker than it looks. There is no camera at all — a fixed
`viewBox="0 0 600 600"` in two separate renderers. The 200-node cap fires on any real `crt-sh`
expansion, so the truncation banner is permanently lit. Nodes are circles distinguished by a colour
slot assigned in order of appearance, while `04-web-ui` §4.2 has always called for icons, colours, and
thumbnails per entity type. And the layout algorithm is force-directed, applied to data that is
overwhelmingly tree-shaped.

TDR-027 chose **Cytoscape.js**, and this design is shaped by what that choice buys and what it costs.
It buys a mature camera, hierarchical layouts in the core, and roughly 10k nodes of canvas headroom. It
costs two things that this document has to handle rather than mention: the node and edge rules in
`packages/ui/css/components/graph.css` move into a second stylesheet language, and canvas has no DOM,
so accessibility is built from nothing.

The `graph.css` cost is smaller than it first appears and the reason is worth stating, because it also
tells us how to do it well. That file's node rules are already data-driven — `--vk-node-cat` is a slot
filled from the entity's kind, and the CSS knows nothing about domains or addresses. Cytoscape's
stylesheet is the same idea in different syntax: `node[kind="domain"] { background-image: ... }`. The
*model* transfers; the file does not.

## Goals / Non-Goals

**Goals**
- A camera — pan, zoom, zoom-to-fit — persisted as view state per investigation.
- Node presentation resolved by entity kind, with a generic renderer that remains correct for kinds
  nothing describes.
- A hierarchical layout for tree-shaped graphs, with disconnected components packed rather than
  overlapping.
- A raised render bound that keeps the truncation guarantee intact.
- One renderer instead of two.
- Accessibility rebuilt to the level it is at today, asserted in tests.

**Non-Goals**
- Streaming or live graph deltas (TDR-003 remains deferred).
- Editing the graph from the canvas; it stays read-only.
- The map and timeline panes.
- Defining what a pack *publishes* as a view spec. The console must be able to consume one; the wire
  format waits for the pack that first needs it.
- Arbitrary markup inside a node. TDR-027 records this as a condition that would reopen the decision;
  it is not designed around speculatively.
- Edge routing and compound nodes — available in Cytoscape, not asked for, and not adopted merely
  because they are now within reach.

## Decisions

### The layout seam is preserved; Cytoscape is given positions unless it is asked for them

`atTime` and `capped` run before anything reaches the renderer, and the `Layout` shape does not change.
Cytoscape's `preset` layout takes supplied positions, so the existing pipeline stays a first-class path
rather than a legacy one. Its own layouts (`breadthfirst`, `concentric`, `cose`/`fcose`) are then a
per-graph choice made on top, not a replacement for the pipeline.

This is deliberate and slightly against the grain. The path of least resistance with a toolkit is to
let it own filtering and selection as well as layout, at which point `atTime`, `capped`, and the
console's selection model quietly acquire competitors and the temporal filter has two implementations.
Filtering stays upstream. Selection has one home.

### The hierarchical layout comes from the core, and no layout package is adopted

`breadthfirst` handles rooted hierarchies and is in `cytoscape` itself. That removes a dependency the
alternative design needed, and with it the ELK licensing question entirely.

**`cytoscape-elk` is not adopted.** It is MIT, but it declares `elkjs` — `EPL-2.0 OR
GPL-3.0-or-later` — as a direct dependency. An MIT wrapper does not change the licence of the code that
ships in the bundle. If ELK's orthogonal routing is ever wanted, that is a separate decision with the
copyleft position accepted explicitly. `cytoscape-dagre` (MIT) is the clean escape hatch if
`breadthfirst` proves insufficient.

Multiple disconnected roots need checking specifically: a forest must pack rather than overlap, and
this is the exact failure mode the current `forceCenter`-only layout has.

### Per-kind presentation is a stylesheet derived from design tokens, rebuilt on theme change

Node appearance is expressed as Cytoscape selectors over entity data:

```
node[kind = "domain"]      { background-image: …; label: data(label) }
node[state = "discarded"]  { opacity: 0.28 }
node[state = "seed"]       { background-opacity: 0; border-style: dashed }
```

The provenance semantics `graph.css` encodes are carried over intact — the seed hollow and dashed
because nothing has evidenced it yet, `--discarded` faded rather than hidden because the entity is
still in the log. What changes is the language, not the meaning.

Colours and typography still come from the `@viokit/ui` design tokens, read from computed custom
properties when the stylesheet is constructed. **That construction must re-run on theme change.** A
stylesheet built once holds the old theme's colours through a dark/light switch, and the graph becomes
the one surface that did not follow — the most likely way these two stylesheet languages drift apart.
There is a test for exactly that.

### Kind→presentation resolution lives in the console, and the fallback must stay honest

The console resolves `entity.kind` to a presentation, falling back to a generic one. The fallback is
the important half: an unknown kind renders as *an entity of an unknown kind*, showing its kind string,
rather than borrowing a presentation that implies knowledge no pack supplied. This is the open-domain
rule, and it is already how the `--cat-N` slot works.

A view spec, where one exists, supplies label, image, colour, and badge — which is exactly the set
Cytoscape's stylesheet expresses. Whether the spec arrives from a pack over the catalog surface or is
mapped in the console is left open; the resolution point is the same either way.

### Accessibility is built, not adapted, and specified as an outcome

This is the largest cost the renderer decision accepts, and the way it goes wrong is being left until
last and then dropped as polish — leaving the graph as the one surface in the console a keyboard cannot
operate.

Canvas has no DOM, so `role="button"`, `tabIndex`, `aria-pressed`, `:focus-visible`, and the 10px
transparent edge hit-line do not port. The known pattern is a parallel, visually-hidden DOM structure
mirroring nodes and edges, synchronised with the canvas, carrying focus and announcing selection. It is
spiked before the renderer swap rather than after, because if it does not work the renderer decision
needs revisiting and that is much cheaper to learn early.

The spec states the obligation — keyboard operable, selection exposed, focus visible, entities named —
and not the mechanism. The implementation is free; the outcome is tested.

### The bound is configuration, and the truncation test is written against it

The failure mode for "raise the cap" is that the number moves, the message stays, and nobody re-checks
that the message still fires. So the bound is a named value and the truncation scenarios assert against
*the configured bound* rather than a literal. Moving the number cannot silently disarm the guarantee.
`capped()` keeps retaining the highest-degree entities: an arbitrary slice would be equally honest and
far less useful.

The bound is two limits wearing one name. Cytoscape carries roughly 10k nodes; a person carries far
fewer. The cap encodes the **readability** limit, which is why it survives a renderer that no longer
needs it. This also downgrades the measurement in task 0.3 from a gate to a tuning exercise — whatever a
large expansion returns, this renderer can draw it.

### Layout is chosen per graph, and the choice is visible

Automatic selection is a default, not a behaviour: the layout in use is named in the UI and can be
overridden. A graph that silently rearranges because a heuristic changed its mind is worse than one laid
out imperfectly but predictably.

Predictability is also a correctness property here. `breadthfirst` and `preset` are deterministic;
`cose`/`fcose` are not without a pinned seed. The `graph-layout` tests depend on settled, reproducible
positions, so any force layout used must have its randomness fixed.

### One renderer, and the collapse happens first

`views/GraphCanvas.tsx` and `CaseCanvas` in `views/Case.tsx` draw the same `Layout` through different
CSS. Collapsing them is the first task rather than the last: doing it afterwards means building the
camera, the presentation layer, and the accessibility layer twice, and one copy quietly not getting the
fix.

## Risks / Trade-offs

- **Accessibility starts at zero.** Not a regression risk — a construction cost, accepted knowingly.
  Spiked early (task 0.4) so that discovering it is unworkable invalidates the renderer choice while
  that is still cheap.
- **Two stylesheet languages describing one design system.** Mitigated by keeping tokens as the single
  source and rebuilding the Cytoscape stylesheet from them on theme change. The theme-switch test is the
  canary.
- **Reversibility is worse than it was.** Re-expressing the stylesheet and building an accessibility
  layer are costs that do not transfer to a third renderer. This is the price of adopting a toolkit
  rather than a component, and it argues for treating the decision as settled for a good while.
- **Node content is not arbitrary.** Image, label, shape, borders. §4.2's specs fit; a node containing
  markup does not. Recorded in TDR-027 as a reopening condition.
- **A permanently-lit warning teaches investigators to ignore warnings.** Raising the bound is partly a
  fix for the truncation message's credibility, not only for what is displayed.
- **Determinism must be re-established, not assumed.** `graph-layout` has tests that depend on a settled
  simulation; a force layout in Cytoscape needs its seed pinned to keep them meaningful.

## Migration Plan

1. TDR-027 is `decided` — the gate is satisfied.
2. Spike the accessibility layer over a bare Cytoscape canvas. This can still invalidate the renderer
   choice, so it runs before the swap.
3. Measure a real expansion to fix the readability bound. Tuning, not gating.
4. Collapse the two renderers into one, still SVG — a pure refactor with existing tests green.
5. Introduce Cytoscape behind the same props the collapsed renderer already takes, with `preset` and the
   existing positions, so the swap changes the renderer and nothing else.
6. Camera, then view-state persistence.
7. Accessibility layer proper, from the spike.
8. Core layouts beside `preset`; determinism re-asserted.
9. Stylesheet from tokens, kind→presentation resolution, generic fallback; legend follows.
10. Raise the bound last, with the truncation test already written against the configured value.
