## Context

`packages/engine/src/graph-duckdb.ts` builds the store with `DuckDBInstance.create()` — no path — so every instance is an anonymous in-memory database. The step log (I3 system of record), projection tables, and all writes vanish at process exit. There is currently no way to reopen a prior investigation's graph. See proposal.md — Why.

`@duckdb/node-api`'s `DuckDBInstance.create(path?)` already supports an optional path: `undefined`/empty ⇒ in-memory, a file path ⇒ a durable embedded database. Because DuckDB is a file format, persisting the step log and rebuild-with-replay is a config + reopen concern, not a new store.

## Goals / Non-Goals

**Goals:**
- Make the graph store openable against a named DuckDB path (durable file).
- Keep the in-memory default (no path) so existing layers/tests are unchanged.
- On reopen, retain the append-only step log and rebuild the projection via `replay`, so queries reproduce the prior state (I3/I11).
- Prove durability: write → close → reopen same path → replay/query returns prior state.

**Non-Goals:**
- No schema changes to the graph data model; no migration of existing step shapes.
- No new query surfaces.
- No change to the `GraphStore` interface.
- No interplay with the source-catalog store or evidence store backends.

## Decisions

**D1 — A tiny config service carries the path; empty file means in-memory.**
Add a `DuckDBConfig` Context.Service (string path, e.g. `":memory:"`-style empty default) that `DuckDBGraphLayer` reads. `DuckDBGraphService.make` calls `DuckDBInstance.create(path)` with the resolved path (or omits it when empty). This keeps the default compose path unchanged (`duckdb-graph-persistence`/`p2-pipeline-seam` tests keep working) and gives callers an opt-in `Layer.succeed(DuckDBConfig, "/tmp/viokit.db")`.
Alternatives considered: a global singleton path (rejected — hides the seam and makes tests mutually shadowy), and a per-call path parameter on `GraphStore` methods (rejected — path is a layer-level concern, not per-query).

**D2 — File path ⇒ skip the `:memory:`/anonymous instance and persist everything.**
With a named path, `create(path)` writes the whole database (step log + projection tables). The system-of-record step log therefore survives. On open of an existing file, `DuckDBGraphService.make` still creates the tables (`CREATE TABLE IF NOT EXISTS`), and the projection is rebuilt by the existing `replay()` path — so reopen automatically folds prior steps into the materialized projection. No change to the append-only model (I3/I11).

**D3 — Explicit `dispose`/close.**
Add a `dispose(): Effect.Effect<void>` to the store so a caller can `closeSync()` cleanly (flush + release the file) before reopening the same path in a new process. In-memory/no-path stores close trivially. This is the mechanism the durability test uses to simulate a process restart (write → dispose → reopen).

## Risks / Trade-offs

- **Stale projection vs. log divergence on crash** → the projection is a derived artifact rebuilt from the step log on replay; a torn file's `replay` re-derives it from the retained log, so the log remains authoritative. Risk is DuckDB's own crash-safety, accepted (TDR-005).
- **Path collisions / concurrent openers** → DuckDB allows a single writer; documents and tests should treat a path as owned by one store at a time. Mitigation: default remains in-memory; persistence is opt-in.
- **`closeSync` is synchronous** → wrap in `Effect.tryPromise`/`Effect.sync` to stay within the effect seam and map errors to a typed outcome.
- **Temp-file tests** → durability tests should write to a throwaway temp path per test (a `mkdtemp`-style location) and clean it up, so they don't collide with real investigation files.