# Graph camera and per-kind node rendering

> **TDR-027 is `decided` (2026-08-26)** and supersedes TDR-020: **Cytoscape.js** for the camera,
> rendering, hit-testing, and layout; per-kind node presentation through its selector stylesheet; the
> `atTime`/`capped`/`layout` seam preserved via `preset`; WebGL declined on the per-kind-rendering
> requirement that raised the question. Two costs are accepted deliberately and carried through this
> proposal: the graph's CSS rules move into a second stylesheet language, and canvas has no DOM, so
> accessibility is **rebuilt rather than inherited**.

## Why

The graph pane cannot be navigated, cannot show a real expansion, and cannot tell one kind of thing
from another.

**There is no camera.** Both graph renderers draw into a fixed `viewBox="0 0 600 600"`. An investigator
cannot pan and cannot zoom. Whatever the layout produces is what is on screen, at whatever scale it
happened to land. TDR-020 said the camera would be view state persisted through TDR-012; there has
never been a camera to persist. This is the single most-felt gap.

**The 200-node cap binds in ordinary use.** `crt-sh-certificate-search` fans a domain into its
subdomains and each subdomain resolves to addresses. A real domain exceeds 200 on one expansion, so
`capped()` fires as a matter of course and "N omitted by the render limit" becomes permanent furniture.
A warning that is always on is a warning nobody reads — which corrodes the one thing the message exists
to protect, that a subset is never mistaken for the whole graph.

**Every node looks the same.** A domain and an IP address are drawn as identical circles distinguished
only by a colour slot assigned in order of appearance. `04-web-ui.md` §4.2 has always specified a
per-entity-type view spec — display name, icon, colour/badge, thumbnail — and TDR-020 deferred it as an
open question because no pack shipped one. The graph is the surface where kind matters most, and it is
the surface that shows kind least.

**The layout is wrong for the data.** Domain → subdomains → addresses is a tree, usually several,
cross-linked where subdomains share a host. Force-directed layout renders that as a blob: the
hierarchy the data *has* is not the hierarchy on screen, and disconnected components are held in frame
by nothing but a centring force. This is a readability failure that no amount of renderer improvement
would fix, and it is likely worth more than the renderer change is.

**And there are two renderers.** `views/GraphCanvas.tsx` and `CaseCanvas` inside `views/Case.tsx` both
draw the same `Layout` from the same `graph-layout.ts`, one styled by the console's own CSS and one by
`@viokit/ui`. Every improvement below would otherwise have to be made twice, and one of them would
quietly not be.

## What Changes

- **A camera.** Pan, zoom, zoom-to-fit, and zoom about the pointer. It persists as view state through
  the TDR-012 store keyed by investigation (I12) — reopening a case returns to where the investigator
  was looking, because re-finding your place in a graph is most of the cost of leaving it.
- **Nodes render by entity kind.** A view spec — display name, icon or thumbnail, colour, badge —
  resolved per kind, with a generic renderer that stays correct for kinds nothing describes. Unknown
  kinds must render honestly rather than fall back to something that implies knowledge we do not have.
- **A hierarchical layout for tree-shaped graphs**, alongside a force layout, so an expansion reads as
  the tree it is. Disconnected components are packed rather than left to drift. Both come from
  Cytoscape's core, so no layout dependency is added.
- **The cap rises and stays.** The bound moves to what the renderer comfortably carries, `capped()`
  continues to keep the highest-degree entities, and truncation continues to be stated. The bound
  becomes a measured number rather than an assumed one.
- **One renderer.** `GraphCanvas.tsx` and `CaseCanvas` collapse into a single component serving both
  the graph view and the case workbench.
- **Accessibility is rebuilt, and specified as an outcome.** Canvas has no DOM, so keyboard
  operability, an exposed selection state, a visible focus indication, and labels naming the entity are
  constructed rather than inherited. This is the largest cost the renderer decision accepts, so it is a
  work item with tests rather than an assumption.

Not in this change: streaming or live graph deltas (TDR-003 stays deferred); editing the graph from the
canvas — it remains read-only; the map and timeline panes (`04-web-ui` §5); packs actually *shipping*
view specs, as opposed to the console being able to consume one; edge routing and compound nodes.

## Capabilities

### Modified Capabilities

- `console`: the graph is navigable, nodes render by kind, the layout suits tree-shaped graphs, and the
  render bound is raised without weakening the truncation guarantee.
- `view-state`: the camera joins selection as persisted view state, keyed by investigation.

## Impact

- `apps/console/src/graph-layout.ts`: `atTime`, `capped`, and the `Layout` shape are unchanged — the
  seam is the reason this change is cheap. A hierarchical layout is added beside `layout()`, and the
  default cap moves.
- `apps/console/src/views/`: `GraphCanvas.tsx` and `CaseCanvas` collapse into one renderer built on
  Cytoscape; `Case.tsx` and `App.tsx` consume it.
- `packages/ui`: `graph.css`'s **node and edge rules move into a Cytoscape stylesheet**; the canvas
  frame, scrubber, and legend stay ordinary DOM and keep their CSS. Design *tokens* remain shared, so
  the graph's colours and type still come from one place even though the rule syntax differs.
  `Legend.tsx` learns view-spec kinds.
- View state: a camera document per investigation through the TDR-012 store (I12), never
  `localStorage`.
- Dependencies: `cytoscape` (3.34.1, MIT, **no transitive dependencies**) and `@types/cytoscape`. No
  layout package: `breadthfirst` and `concentric` are in the core. **`cytoscape-elk` is not adopted** —
  it is an MIT wrapper that declares `elkjs` (`EPL-2.0 OR GPL-3.0-or-later`) as a direct dependency,
  and the wrapper's licence does not change what ships.
- Tests: the camera round-trips through view state; truncation still reports; keyboard reachability and
  ARIA survive; layout stays deterministic; a forest lays out as a forest.
- TDR-027 is `decided`; the TDR gate is satisfied.

## Risks

- **[The cap becomes a lie by degrees]** — raising the bound is the part most likely to be done
  halfway: the number moves, the message stays, and nobody re-checks that the message still fires. This
  codebase has produced a run of silent-wrong-answer failures (a browser inheriting another
  acquisition's proxy route; every artifact recorded with a placeholder content type; an in-memory
  redaction store that let withheld material into an export). → The truncation test is written against
  the *configured* bound rather than a literal, so moving the number cannot silently disarm it.
- **[Accessibility is not merely at risk of regressing — it starts at zero]** — this is the accepted
  cost of a canvas renderer, and the way it goes wrong is that it is left until last and then dropped
  as "polish". The graph would become the one surface in the console a keyboard cannot operate.
  → Spiked before the renderer swap (task 0.4), built as its own section, and asserted in tests. The
  spec states the outcome, not the mechanism, so the implementation is free but the obligation is not.
- **[Two stylesheet languages describing one design system]** — node and edge appearance moves into
  Cytoscape's vocabulary while the rest of the console stays CSS, and the two drift. Most likely on a
  theme change: a stylesheet built once from computed custom properties keeps the old theme's colours
  after a dark/light switch. → Design tokens stay the single source; the Cytoscape stylesheet is
  derived from them and rebuilt on theme change, with a test for exactly that.
- **[Node content is not arbitrary]** — a Cytoscape node is an image, a label, a shape, and borders.
  §4.2's view specs (name, icon, colour/badge, thumbnail) fit; a node needing markup or a sub-view does
  not. → Accepted and recorded in TDR-027 as a condition that would reopen the decision. Not designed
  around speculatively.
- **[The seam is easy to lose to a toolkit]** — Cytoscape can own layout, and the path of least
  resistance is to let it own filtering and selection too, at which point `atTime`, `capped`, and the
  console's selection model quietly have competitors. → `preset` keeps supplied positions first-class;
  filtering stays upstream of the renderer; selection has one home.
- **[View specs get designed for a pack that does not exist]** — §4.2 says packs ship them; none does.
  Designing the wire format now risks guessing. → The console defines a kind→renderer resolution with a
  generic fallback and consumes a spec if given one; what a pack *publishes* is left to the pack that
  first needs it.
- **[Automatic layout selection surprises]** — detecting a forest and silently switching layout is
  friendly right up until the graph rearranges for reasons the investigator cannot see. → The layout in
  use is named in the UI and can be chosen; automatic selection, if adopted, is a default rather than a
  behaviour.
