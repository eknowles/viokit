# View-State Persistence

## Why

I12 requires every surface's view state to be schema-encoded, versioned, per (user, investigation), and server-backed. Nothing implements it, and the console said so out loud: `console-spa` shipped with a reload that starts over, recording I12 as the outstanding P3 exit criterion rather than half-satisfying it in `localStorage`. This closes it.

The cost of leaving it open is not only usability. Every surface added from here — a workbench, a graph camera, table columns — accumulates state that has to go *somewhere*, and the somewhere it goes by default is the browser, which is the one place the invariant forbids.

## What Changes

- **A `ViewStateStore` seam** holding one schema-encoded, versioned document per (user, investigation, surface), stored under a configured directory and entirely apart from the step log and the evidence store (TDR-012).
- **View state is reached through the operation table**, so persisting it is not a console-only capability and no front-end gets a privileged path to it (I8).
- **The console persists and restores** what it holds: the current view, the selected transform, and the catalog's runnable filter. A reload returns to where the investigator was.
- **A document that fails to decode is discarded in favour of defaults.** Unusable configuration must never make an investigation unusable.
- **User and investigation are explicit placeholders** — a single local user and a default investigation — carried in the key from day one so that governance (P4) and the investigations capability change their values, not the store's shape.

Not in this change: cross-device sync, multi-writer conflict resolution, and view state in evidentiary export (TDR-010's question, not this one).

## Capabilities

### New Capabilities

- `view-state`: durable, versioned, per-surface view state kept apart from the evidentiary record — what a surface must be able to save and restore, and what it must never do with it.

### Modified Capabilities

- `agent-integration`: the operations gain saving and loading view state, so every front-end can persist it.
- `console`: the console restores its view state on load rather than starting over, and no longer records I12 as outstanding.

## Impact

- `packages/schema`: a `ViewState` document (key, version, payload), the `ViewStateStore` seam, and a typed error for a store that cannot be written.
- `packages/engine`: a filesystem-backed store under a configured directory; `Engine` gains load and save.
- `packages/agent`: two operations on the shared table, so MCP, CLI, and HTTP all get them.
- `apps/console`: saves on change and restores on load, through the same client as everything else.
- Tests: round-trip, versioning, a corrupt document falling back to defaults, isolation between keys, and — importantly — that view state never appears in the step log or evidence.
- Docs: `ROADMAP.md` P3's outstanding I12 note is removed, and the console README stops saying a reload starts over.
