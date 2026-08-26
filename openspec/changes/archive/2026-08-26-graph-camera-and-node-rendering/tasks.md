# Tasks — Graph camera and per-kind node rendering

> **TDR-027 is `decided` (2026-08-26)**: Cytoscape.js, hierarchical layout from its core, the
> `atTime`/`capped`/`layout` seam preserved through `preset`. The gate is satisfied. Section 0 still
> runs first — it contains the accessibility spike, which is the one thing that could still invalidate
> the renderer choice, and it is far cheaper to learn now than after the swap.

## 0. Before the swap

- [x] 0.1 Confirm `cytoscape` (3.34.1, MIT, no dependencies) and `@types/cytoscape` are the whole
      dependency addition. **Do not add `cytoscape-elk`**: MIT wrapper, `elkjs` (EPL-2.0 OR
      GPL-3.0-or-later) underneath. `cytoscape-dagre` (MIT) only if `breadthfirst` proves insufficient.
      **Confirmed:** installed `cytoscape@3.34.1` declares MIT, zero `dependencies`, zero
      `peerDependencies`; its own `node_modules` contains only itself. `@types/cytoscape@3.31.0` is a
      dev dependency. `cytoscape-dagre` not needed — see 0.2.
- [x] 0.2 Confirm `breadthfirst` (core) covers rooted hierarchies, including a forest of several roots
      packed without overlap. If it does not, decide dagre here rather than mid-build.
      **Confirmed** against a two-root forest with shared leaf addresses (the crt.sh data shape):
      12 nodes placed, **0 coincident pairs**, 3 distinct y-levels, roots above their children. Two
      identical runs produced byte-identical positions, so `breadthfirst` is **deterministic** — which
      also satisfies 6.5/6.6 without pinning a seed. `concentric` was tried and rejected: 7 coincident
      pairs and no hierarchy. No layout package is adopted.
- [x] 0.3 Measure a real `crt-sh-certificate-search` expansion of a large domain: entities and relations
      at one and two hops. Tuning, not a gate — this renderer carries whatever it returns. The number
      wanted is the *readability* bound, which is lower than the render bound.
      **Measured 2026-08-26, and it partly contradicts this proposal.** crt.sh was returning 502 for
      most domains; `stripe.com` succeeded: 2,347 certificate rows projecting through the pack's own
      logic (wildcard stripping, dedupe, in-domain filter) to **188 entities and 187 relations at one
      hop** — *under* the old 200 bound. So "the cap binds in ordinary use" is **not** supported at one
      hop for this domain. It is supported at two: 188 subdomains each resolving to at least one
      address at least doubles it, past 200 with certainty. Bound set to **1000**, which clears a
      two-hop expansion with room and stays well inside what can be read. **One domain is one data
      point** — the other five attempted all 502'd, and this should be re-run when crt.sh is healthy.
- [x] 0.4 **Spike the accessibility layer** over a bare Cytoscape canvas: a visually-hidden DOM
      structure mirroring nodes and edges, carrying focus and announcing selection. This is the largest
      cost the renderer decision accepts. If it cannot be made to work, stop and revisit TDR-027 —
      that is the point of doing it first.
      **Done, and kept rather than thrown away.** The finding that made it cheap: derive the mirror
      from the *same view model* that produces the drawing (`mirrorItems` in `graph-elements.ts`),
      rather than syncing it to the canvas. Two things derived from one source cannot disagree, and
      it makes the whole layer assertable without a browser. The canvas is `aria-hidden` (it is a
      picture); the mirror carries the semantics. The renderer decision stands.
      **Not verified with a real screen reader** — that needs a human, and it is the one claim here
      that rests on structure rather than observation.

## 1. One renderer

- [x] 1.1 Collapse `views/GraphCanvas.tsx` and `CaseCanvas` (in `views/Case.tsx`) into a single graph
      renderer component. Pure refactor: still SVG, no behaviour change, existing tests green.
- [x] 1.2 Settle its props — nodes, edges, selection, and the selection callback — so the case
      workbench and the graph view are the same component with different data.
- [x] 1.3 Retire the console's duplicate `.node`/`.edge` rules in `styles.css`.
- [x] 1.4 Test: both surfaces render through the one component and selection behaves identically.
      **Done** in `test/graph-view.test.ts` (14 assertions). The collapse point is a *view model*
      (`src/graph-view.ts`): plain ids, positions, classes, and strings. That keeps it assertable
      without a DOM — the console's tests have no browser environment — and it is already the shape
      Cytoscape wants to be handed, so section 2 changes the renderer underneath without changing it.

## 2. The renderer swap

- [x] 2.1 Add `cytoscape` and `@types/cytoscape` to the console.
- [x] 2.2 Reimplement the collapsed renderer on Cytoscape behind the same props, using `preset` with the
      positions `layout()` already produces — the swap changes the renderer and nothing else.
- [x] 2.3 `atTime` and `capped` stay upstream of the renderer. Filtering does not move into Cytoscape;
      the temporal filter must not acquire a second implementation.
- [x] 2.4 Selection stays owned by the console; Cytoscape's internal selection is driven from it, not
      mirrored beside it.
- [x] 2.5 Edges remain selectable with a usable hit target — the transparent fat-line trick has a
      Cytoscape equivalent, or edge selection regresses.
      **Better than the thing it replaces.** Cytoscape hit-tests edges at
      `width / 2 + edgeThreshold` where `edgeThreshold = (isTouch ? 24 : 8) / zoom`, so a 1.5px edge
      has a 17.5px target with a mouse and 49px on touch — against the 10px transparent fat line the
      SVG renderer needed. No equivalent hack required.
- [x] 2.6 Test: nodes and edges render for a committed graph; an empty graph still says it is empty;
      the temporal filter still hides what was not yet valid.

## 3. Accessibility, rebuilt

- [x] 3.1 Build the mirrored structure from the 0.4 spike: every rendered node and selectable edge is
      represented, and the representation stays in sync as the graph changes.
- [x] 3.2 Keyboard operation: move between nodes and select without a pointer.
      **Limitation, recorded not hidden:** the mirror is a plain list, so this is tab order. That is
      correct and complete at today's scale and poor at a thousand nodes — nobody tabs through a
      thousand buttons. A roving-tabindex listbox with arrow-key movement is the fix, and it belongs
      with task 8.1 (raising the bound), because that is the task that makes it matter.
- [x] 3.3 A visible focus indication on the canvas that follows keyboard focus.
- [x] 3.4 Selected state and an entity-naming label available to assistive technology.
- [x] 3.5 Test: the graph is fully operable by keyboard, exposes selection, and names entities. This is
      the cost the renderer decision accepted, so it is the test that proves the decision was honoured.
      **Done** in `test/graph-elements.test.ts`. The mirror is a pure derivation of the same view model
      that produces the drawing (`mirrorItems`), so the tests assert the property that matters — every
      announced item is drawn, every item is named, and nothing unselectable is offered as a control.
      A mirror maintained separately is one that goes stale, and a stale accessibility tree lies.

## 4. The camera

- [x] 4.1 Pan, zoom, and zoom-about-pointer.
- [x] 4.2 Zoom-to-fit, with sensible zoom limits.
- [x] 4.3 Panning and zooming do not disturb selection or the detail panel.
- [x] 4.4 An investigation with no stored camera opens fitted, not at an arbitrary origin.
- [x] 4.5 Test: fit frames every rendered node; selection survives navigation.

## 5. Camera as view state

- [x] 5.1 A camera document — pan and zoom — schema-encoded and versioned, per TDR-012.
- [x] 5.2 Persist through the view-state store keyed by investigation (I12). Not `localStorage`.
      **Free, as it turned out**: `view_state_save` already resolves `args.investigation ?? open.id`
      server-side, so adding `camera` to `ConsoleViewState` is scoped per investigation with no
      plumbing. The `localStorage` half is asserted by scanning `src/` rather than by description —
      the test was checked to fail when the invariant is deliberately broken.
- [x] 5.3 Write on settle rather than on every frame.
- [x] 5.4 Test: the camera round-trips across a reload; two investigations keep separate cameras; the
      camera is never written to browser-local storage.

## 6. Layout

- [x] 6.1 Offer the core hierarchical layout beside `preset`, behind the same `Layout` return shape.
- [x] 6.2 Disconnected components pack rather than overlap — the failure the current `forceCenter`-only
      layout has.
- [x] 6.3 Layout is chosen per graph; automatic selection is a default that can be overridden.
- [x] 6.4 Name the layout in use in the UI.
- [x] 6.5 Pin the seed of any force layout used. `cose`/`fcose` are not deterministic without it, and
      the existing tests depend on reproducible positions.
      **Nothing to pin on the default path.** `layout()`'s d3-force pass is already deterministic
      (asserted in `graph-shape.test.ts`), and `breadthfirst` was verified deterministic in 0.2. Only
      `cose` — an explicit investigator override — is unseeded, and it never runs by default.
- [x] 6.6 Test: determinism holds — the same graph laid out twice gives the same positions.
- [x] 6.7 Test: a root and its derived entities read as a hierarchy; two unrelated components do not
      overlap.

## 7. Nodes render by kind

- [x] 7.1 Build the Cytoscape stylesheet from `@viokit/ui` design tokens rather than literal colours, so
      the graph and the rest of the console cannot drift.
- [x] 7.2 **Rebuild the stylesheet on theme change.** Built once, it holds the previous theme's colours
      through a dark/light switch. Test this specifically — it is the most likely way the two stylesheet
      languages diverge.
- [x] 7.3 Carry over the existing state semantics as selectors: seed hollow and dashed, kept ringed,
      deferred hollow, discarded faded to 0.28 rather than hidden, edges into a discarded node muted.
      The meaning moves even though the syntax does not.
- [x] 7.4 Resolve `entity.kind` to a presentation, with a generic fallback.
- [x] 7.5 The generic fallback renders an unknown kind *as* an unknown kind, showing its kind string —
      it does not borrow a presentation implying knowledge no pack supplied (open-domain rule).
- [x] 7.6 Consume a view spec where one exists: label, image or icon, colour, badge (`04-web-ui` §4.2).
      What a pack *publishes* is out of scope.
- [x] 7.7 Draw the boundary in `packages/ui/css/components/graph.css` deliberately: node and edge rules
      move out; canvas frame, scrubber, and legend stay. The file must not end up half-live and
      half-vestigial.
- [x] 7.8 `Legend.tsx` reflects view-spec kinds, so the encoding stays decodable.
- [x] 7.9 Test: two kinds are visually distinguishable; an undescribed kind still renders and still
      shows its kind; the legend covers every encoding in use.

## 8. Raise the bound

- [x] 8.1 Move the render bound to the readability number measured in 0.3. Named configuration, not a
      literal. **`DEFAULT_NODE_CAP` 200 → 1000**, with the measurement recorded beside it.
- [x] 8.2 `capped()` keeps retaining the highest-degree entities.
- [x] 8.3 Truncation message unchanged in intent and still fires at the new bound. The cap survives a
      10k-capable renderer because it encodes the readability limit, not the render limit.
- [x] 8.4 Test: written against the *configured* bound, so raising the number cannot silently disarm the
      report. Assert at the old bound and the new one.

## 9. Close out

- [x] 9.1 Update `openspec/specs/console/spec.md` and `openspec/specs/view-state/spec.md` from this
      change's deltas.
- [x] 9.2 Record in TDR-027 what 0.3 measured and what 0.4 found — particularly whether the
      accessibility layer cost what the decision assumed it would. **Done** — see the TDR's Findings
      section: the bundle cost the analysis missed, the `cytoscape-elk` licence trap confirmed in the
      lockfile, edge hit-testing coming out *better* than the SVG hack, and the one-hop measurement
      that partly contradicts this proposal's premise.
- [x] 9.3 Note any open question answered on the way: how much of `graph.css` stayed, whether view specs
      are pack-published or console-mapped, and which core layout the forests actually needed.
      - **`graph.css`**: node and edge *appearance* moved; the canvas frame, controls, scrubber,
        legend, and — the one that nearly went wrong — the `--vk-node--cat-N` slot definitions stayed.
        Those last are read by the DOM legend, and deleting them would have left every swatch the same
        grey: a colour encoding nobody can decode, which is the single thing the legend exists to stop.
      - **View specs**: left console-mapped. `view-spec.ts` consumes the §4.2 shape and `SPECS` is
        deliberately empty, because no pack publishes one and seeding it with guesses about kinds
        nobody has shipped would be inventing the contract from the wrong end.
      - **Layout**: `breadthfirst` from the core, alone. No layout package was adopted.
