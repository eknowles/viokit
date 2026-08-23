## Context

See `proposal.md` — Why, and TDR-020 for the rendering decision. What the implementation has to work with:

- `replay` returns `GraphState`: `entities` (id, kind, identifiers, spatialExtent, temporalExtent), `relations` (id, sourceId, targetId, type, temporalExtent), and `events`.
- Every entity and relation carries `validFrom`/`validTo`, so the time dimension needs no new data — only a filter.
- The console persists view state through the TDR-012 store, versioned; adding graph state to that payload is a version bump, not a new mechanism.
- `d3-force` is a maths library with no DOM assumptions: it mutates node objects with `x`/`y` and knows nothing about how they are drawn.

## Goals / Non-Goals

**Goals:**
- See the graph, and see it at a moment.
- Never imply completeness the view does not have.
- Keep layout and rendering separable, so the renderer can change without the layout changing.

**Non-Goals:**
- No map or timeline pane, no live updates, no editing from the canvas.
- No pack-provided node styling — the generic renderer must work without it, and no pack ships a view spec.
- No physics tuning beyond what makes a small graph readable.

## Decisions

1. **Layout runs to completion before the first paint, not as an animation.**
   `d3-force` is usually run as a ticking simulation; here the simulation is stepped synchronously to a settled state and then drawn once. An investigator wants to read a graph, not watch it converge, and a settled layout is deterministic for a given input — which is what makes it testable at all. Alternative considered: an animated simulation (rejected — non-deterministic, untestable, and the motion is decoration).

2. **The time filter is applied before layout, not as a visual mask.**
   Filtering first means the layout reflects what is visible: hiding half a graph without relaying it leaves the remainder scattered around gaps where the hidden nodes were. Slightly more work on each change of time, and a much more readable result.

3. **Truncation happens on entities, and edges follow.**
   The cap is a node count; relations are kept only where both endpoints survived. Capping edges independently would produce edges into nothing. The message reports entities omitted, because that is the number that means something to a reader.

4. **The rendered subset is chosen by connectivity, not arbitrarily.**
   When the graph exceeds the cap, the most-connected entities are kept. An arbitrary slice would be honest but useless; degree is a defensible proxy for "the part of this graph worth seeing first", and the message says a subset is shown either way.

5. **Graph view state joins the console's existing payload, bumping its version.**
   Camera, selection, and time position go into the same document as the current view and selected transform. TDR-012 already treats an unrecognised version as absence, so the bump degrades old documents to defaults automatically — no migration code.

6. **The pane reads `replay` on demand.**
   No caching, no incremental updates: the engine is the source of truth and the graph is small. When streaming lands (TDR-003), this becomes the fallback path rather than being rewritten.

## Risks / Trade-offs

- **[Force layout on every filter change costs work]** → **Mitigation**: the graphs are small and the simulation is capped at a fixed iteration count; if it ever bites, memoising by filtered-node-set is the obvious fix.
- **[Degree-ranked truncation could hide an important isolated node]** → **Mitigation**: real, and the reason the message is mandatory rather than optional. An investigator who sees "showing 200 of 4,312" knows to narrow the query rather than trusting the picture.
- **[SVG will not scale]** → **Mitigation**: accepted and bounded by the cap; TDR-020 records what changes when it stops being enough, and the layout/render split means only the renderer moves.
- **[A settled-before-paint layout can look sudden]** → **Mitigation**: a fair cosmetic cost for determinism and testability.

## Migration Plan

Additive. The view-state version bump means an existing stored document reads as absent and the console starts from defaults — which for a console that gains a new pane is the correct behaviour anyway. No engine changes.

## Open Questions

None blocking.
