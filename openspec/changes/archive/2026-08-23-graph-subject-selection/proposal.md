# Graph Subject Selection

## Why

The trail is entities-only. Selecting a node shows the steps and evidence behind it, but a relation cannot be selected at all, and events are not drawn — so two of the three things a step can assert are unreachable from the canvas.

That matters more than symmetry. A relation is usually the claim under scrutiny: "this domain resolves to that address" is the assertion an investigator needs to justify, and its provenance is exactly as important as an entity's. Events are the graph's time dimension — the thing the temporal extent exists to express — and they are currently invisible.

## What Changes

- **Relations are selectable.** Clicking an edge shows what it asserts, between which entities, over what period, and the steps and evidence behind it.
- **Events are drawn**, distinguished from entities, connected to the entities they involve, and selectable like anything else.
- **Selection becomes subject-agnostic** — an entity, a relation, or an event — so the provenance panel serves all three rather than special-casing one.
- **Provenance matches by subject identity**, so selecting a relation finds the steps that asserted *that relation*, not merely steps mentioning its endpoints.

Not in this change: editing from the canvas, and provenance for evidence itself (an artifact's own acquisition is already shown where it is used).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `console`: relations and events can be selected and show their provenance, as entities already do.

## Impact

- `apps/console`: events join the layout as their own node kind; selection carries a subject rather than an entity id; provenance resolves steps by subject identity; the detail panel renders per kind.
- View state carries the selected subject, so the payload version bumps again.
- Tests: an event appears with edges to its entities; selecting a relation finds the steps that asserted it and not unrelated ones; each subject kind renders its own detail.
- No engine changes — everything needed is already in what `replay` returns.
