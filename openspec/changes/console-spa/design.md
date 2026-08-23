## Context

See `proposal.md` — Why. Three things the console consumes already exist and shape the design:

- **`GET /operations`** lists every operation with its arguments, kinds, and whether each is required.
- **`catalog_list`** returns entries carrying `access`, `runnable`, and a `reason`, so "what can I actually run" is answerable without inference.
- **`catalog_describe`** returns JSON Schema Draft 2020-12 for a transform's input and output.

Constraints: Effect 4.0.0-beta.103; decode with `@viokit/schema` (I6); reach the engine only through the shared surface (I8); persist no view state (I12 — see below).

## Goals / Non-Goals

**Goals:**
- A console with no domain knowledge in it: everything on screen comes from what the deployment reports.
- A visible seam between staging and committing, because that distinction is the provenance model.
- Small enough to iterate on visually without fighting a component framework.

**Non-Goals (design-level, beyond the proposal's scope line):**
- No graph canvas, map, or timeline rendering — results are tables until there is a decided approach for the 4D surfaces.
- No optimistic updates or client-side caching of graph state; the engine is the source of truth and the console re-reads.
- No auth UI. The surface is unauthenticated and loopback-only until governance.

## Decisions

1. **The client is a thin typed wrapper over `POST /operations/:name`.**
   One `call(name, args)` that posts, checks the status, and decodes with the response's schema. Statuses already carry meaning (400 malformed, 404 unknown, 422 operation failed), so the wrapper turns them into typed failures rather than parsing bodies to find out what happened. Alternative considered: a generated client from an OpenAPI document (rejected — TDR-017 deliberately did not produce one, and the operation set is still moving).

2. **Responses are decoded with `@viokit/schema`, and the schema import is the contract.**
   No DTOs, no `as` casts at the boundary. Where an operation returns something the schema does not name — the catalog's JSON Schema documents, for instance — it is treated as opaque JSON and rendered as such rather than given a hand-written type.

3. **State lives in atoms; there is no router.**
   Per TDR-002: `effect/unstable/reactivity` atoms hold the current view, the selected transform, staged steps, and query results; a small `useAtom` over `useSyncExternalStore` subscribes React. View selection is component state. No router until deep-linking is wanted, and no persistence at all (below).

4. **The form renderer walks the published document, with a fallback.**
   Per TDR-008: primitives, enums, required/optional, descriptions as help text; anything unrecognised falls back to a raw-JSON field so the transform stays runnable. Custom components register by transform id and take precedence, which is `04-web-ui.md` §4.1's escape hatch.

5. **Staging and committing are separate screens' worth of intent.**
   `run_transform` returns steps the console shows with their evidence ids; `insert` commits them one at a time. The console does not auto-commit, because the review step between them is where an investigator decides whether a derivation is sound — and because the staged/committed split is how the graph's provenance model actually works.

6. **Client-side validation is advisory.**
   The form marks required fields, but the engine's boundary decode is authoritative (I6). The console shows engine errors verbatim rather than pre-empting them, so what the investigator sees is what the engine actually objected to.

7. **Development runs two processes; the API is not proxied through Vite in production use.**
   Vite serves the console in development and the API runs beside it, with the API's origin configured. Serving the built assets from the API process is a later convenience, not a requirement.

## Risks / Trade-offs

- **[The console can only do what the operation table exposes]** — a view that wants something not in the table cannot have it → **Mitigation**: that is the intended constraint (I8), and the fix is to add the operation to the shared table, where all three surfaces get it.
- **[No persisted view state is a real usability cost]** — reload loses the current transform and results → **Mitigation**: accepted deliberately. I12 requires view state to be schema-encoded, versioned, per (user, investigation), and server-backed; a `localStorage` shortcut would satisfy the user need and violate the invariant, and would be removed when TDR-012 lands. Recorded as an outstanding P3 exit criterion.
- **[`unstable/reactivity` may move under us]** → **Mitigation**: the binding is one small hook in one file; the atoms themselves are used through a narrow surface.
- **[Tables are a weak way to look at a graph]** — the whole point of the tool is the 4D view → **Mitigation**: acknowledged; this change buys the ability to *drive* the engine from a screen, not to visualise it. The canvas is the next design problem and deserves its own decisions.

## Migration Plan

Purely additive: a new app, no changes to any package. Rollback is deleting `apps/console`. Nothing persists, so there is no data to migrate.

## Open Questions

- Whether output schemas eventually drive a generated results view or stay tables. Deferred: it changes no requirement and no task boundary, only the results pane.
