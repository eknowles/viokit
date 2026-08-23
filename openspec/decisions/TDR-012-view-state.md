# TDR-012 — View-state persistence backend

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** `openspec/exploration/04-web-ui.md` §6.3; TDR-006 / TDR-007 / TDR-013 (the seam-then-filesystem precedent); TDR-005 (DuckDB graph store); TDR-002 (the console that consumes this); invariants I12, I3, I6

## Decision summary
> A `ViewStateStore` seam keyed by (user, investigation, surface), holding one schema-encoded, versioned document per key, with a filesystem backend first and SQLite available behind the same seam. Stored entirely apart from the step log and the evidence store, and reached through ordinary operations so every front-end can persist view state, not only the console.

## Context
- The console currently persists nothing, and says so: `console-spa` recorded I12 as an outstanding P3 exit criterion rather than half-satisfying it in `localStorage`. This decision is what closes it.
- `04-web-ui.md` §6.3 sets the requirements: schema-encoded per surface, versioned for migration, per (user, investigation), server-backed with a client cache, and **separated from the step log** — view state is configuration, never evidence, and is deliberately excluded from the evidentiary trail.
- **Two of the three key components do not exist yet.** There is no user concept (authentication is P4 governance) and no investigations capability (`CONTRACT.md` assigns it cases, branching, and export; nothing implements it). A grep of `packages/*/src` finds no investigation anywhere.
- Constraints: decode at every boundary (I6); nothing may enter or be inferred from the step log (I3, I12); the console must reach this through the same operation table as everything else (I8).
- Affects `packages/schema`, `packages/engine`, `packages/agent` (an operation), and `apps/console`.

## Options considered

### Option A — `ViewStateStore` seam; filesystem backend first
- **Description:** One JSON document per (user, investigation, surface), schema-encoded and carrying a version, under a configured directory. SQLite behind the same seam when multi-user arrives.
- **Pros:** Matches the pattern TDR-006, TDR-007, and TDR-013 all settled on, so it is the shape this codebase already reasons about. View state is a keyed blob with a single writer — a directory of documents is a faithful model, not a compromise. Trivially separated from the step log and evidence, satisfying I12's separation clause structurally rather than by convention. Inspectable by hand, which matters while the shape is still moving.
- **Cons:** No concurrent-writer story; two consoles editing one key race. Cross-device sync (§6.3's stated goal) needs the server to be shared, which a local filesystem is not.

### Option B — SQLite, reusing the `@effect/sql-sqlite-bun` dependency
- **Description:** A `view_state` table keyed by (user, investigation, surface), in its own database file.
- **Pros:** Already a workspace dependency (TDR-013). Atomic writes and a real concurrency story. Query-able if view state ever needs to be searched or bulk-migrated.
- **Cons:** Buys concurrency control for a workload that has one writer, and a schema migration story for documents that already carry their own version. Heavier to inspect while iterating.

### Option C — Store it in the DuckDB graph database (TDR-005)
- **Description:** A separate table alongside the step log and projections.
- **Pros:** No new store at all; one file to back up.
- **Cons:** Puts configuration in the same database as the evidentiary record. I12 requires view state to live apart from the step log, and "a different table in the same file" invites exactly the coupling the invariant exists to prevent — a backup, export, or replay of the graph would carry UI configuration with it. Rejected on the invariant.

### Option D — Client-side only (`localStorage` / IndexedDB)
- **Description:** Persist in the browser.
- **Pros:** No server work; instant.
- **Cons:** Fails I12's server-backed requirement outright, does not survive a device change, and is invisible to any non-browser surface. This is precisely what `console-spa` declined to do.

## Evaluation criteria
1. Satisfies I12 as written: schema-encoded, versioned, per (user, investigation), server-backed, separate from the step log
2. Fidelity of the storage model to the workload (one writer, keyed documents)
3. Consistency with the seam-then-filesystem pattern the other stores established
4. Cost now, and the cost of the move when multi-user arrives
5. Inspectability while the surfaces are still being designed

## Analysis
- **Criterion 1 eliminates C and D.** D fails the invariant on its face. C is more subtle and more tempting — it is the cheapest option — but the separation clause is not decoration: the moment view state shares a database with the step log, every graph export, backup, and replay has to be careful not to carry it, and eventually one will not be.
- **A versus B turns on criterion 2.** B's advantages are concurrency and query, and this workload has neither: one console writes its own key, and the documents are versioned by their own schema rather than by table migration. Paying SQLite's ceremony for a keyed blob store is the same mismatch TDR-008 rejected for forms.
- **Criterion 4 favours A more than it first appears.** The seam is the thing that makes the backend cheap to change, and it is identical in both options; choosing A costs nothing later that choosing B saves now. When multi-user or cross-device sync arrives — which needs a shared server, not merely a different file format — B goes behind the same seam.
- **Criterion 5 is a real short-term factor.** The set of things worth persisting is going to change with every surface added, and reading a directory of JSON documents while that settles is worth more than it will be in a year.
- **The missing keys are the honest risk.** Keying by (user, investigation) when neither exists means both are placeholders today: a single local user, and a single default investigation. The alternative — waiting for the investigations capability — would leave I12 open indefinitely. Carrying both keys in the schema from the start means the store does not change shape when they become real; only their values stop being constants.

## Recommendation
- **Option A.** A `ViewStateStore` seam; one schema-encoded, versioned document per (user, investigation, surface); filesystem backend under a configured directory, with SQLite behind the same seam when a shared deployment needs it.
- View state is reached through the operation table like everything else, so it is not a console-only capability and no front-end gets a privileged path to it (I8).
- **User and investigation are placeholders**: a single local user and a default investigation until governance (P4) and the investigations capability exist. The keys are in the schema from day one so that becoming real is a change of values, not of shape.
- Documents carry a version and are validated on load (I6); a document that fails to decode is discarded in favour of defaults rather than failing the surface, because unusable *configuration* must never make an investigation unusable.
- **What would change this decision:** a shared or multi-user deployment, or cross-device sync becoming a requirement — both of which promote B behind the same seam.

## Open questions
- Whether view state should be exportable alongside an investigation bundle (TDR-010). Deferred: it is a question about the export format, not about where view state lives.

## References
- `openspec/exploration/04-web-ui.md` §6.3 (scope and design of view state)
- `CONTRACT.md` I12; "View state is written to the step log" is a forbidden crossing
- TDR-006, TDR-007, TDR-013 (seam-then-filesystem precedent); TDR-005 (why not the graph database)
