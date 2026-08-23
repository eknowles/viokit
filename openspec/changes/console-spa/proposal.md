# Console SPA

## Why

The engine is driveable over three protocols and none of them is a screen. Building an investigation today means composing curl calls or MCP tool invocations by hand, which is workable for a test and hopeless for actually looking at a graph. `ROADMAP.md` P3's goal is that humans and agents drive the same engine; the agent half shipped, the human half stops at a CLI.

The pieces a console needs already exist and were built deliberately: the HTTP surface describes itself (`GET /operations`), the catalog describes every source and transform including whether this deployment can actually run it, and `catalog_describe` publishes each transform's contract as JSON Schema. A console that reads those three things is generic — registering a pack grows the UI with no UI code, which is the property `04-web-ui.md` §4.3 identified as the payoff.

## What Changes

- **`apps/console`** — a React + Vite SPA (TDR-002) over the local HTTP surface, with four generic views:
  - **Catalog** — registered sources, transforms, and ontology types, showing which sources this deployment can acquire and why not for the rest.
  - **Transform launcher** — a form generated from the transform's published JSON Schema (TDR-008), run by catalog id, staging steps without committing them.
  - **Steps and results** — staged and committed steps with their evidence attribution, and the commit action.
  - **Graph** — the four query surfaces (paths, timeline, spatial, relatedness) and entity lookup, rendered as tables.
- **Every response decoded with `@viokit/schema`** — no hand-written DTOs, so the client and engine agree by construction (I6).
- **The console reaches the engine only through the HTTP surface** — no privileged path, the same guarantee the other front-ends carry (I8).
- **Evidence submission** — the `ingest` operation is exposed as a form, so an investigator can work a login-walled source by hand and attach the result.

Explicitly not in this change: live updates and streaming (gated on TDR-003), the 4D graph canvas, map and timeline panes, docking (TDR-004), and **any persisted view state** — I12 requires that to be schema-encoded and server-backed, which is TDR-012's decision, so this console keeps its view state ephemeral rather than half-satisfying the invariant in `localStorage`.

## Capabilities

### New Capabilities

- `console`: the human-facing browser client — capability discovery, transform launching from published contracts, evidence submission, step review, and graph queries, all over the shared HTTP surface with no privileged path.

### Modified Capabilities

None.

## Impact

- `apps/console` (new): Vite + React app; an Effect-backed client that decodes with `@viokit/schema`; atoms for client state; the schema→form renderer; four views.
- No engine or front-end changes — the console consumes what TDR-017 already exposes. If it needs an operation that does not exist, that is a change to the shared table, not to the console.
- Dependencies: React, Vite (TDR-002). The state layer is `effect/unstable/reactivity`, already in the tree.
- Tests: the form renderer against real published schemas, the client's decoding of each operation's response, and a run-through of the catalog → launch → commit → query loop against a real engine layer.
- Docs: how to start the API and the console together for local use.
- **P3's I12 exit criterion is not met by this change** and is recorded as outstanding, not quietly satisfied.
