# Tasks — DuckDB Graph Persistence

> Ordered to add the path config seam, wire the persistent open/rebuild, prove durability end-to-end, then refresh docs. Prereq: none beyond P2 (graph-duckdb, p2-pipeline-seam) merged.

## 1. Config seam for the persisted path

- [x] 1.1 Add a `DuckDBConfig` Context.Service (holding an optional database path) in `packages/schema/src/seams.ts` (or a small local config service), with a sensible empty/`:memory:`-style default.
- [x] 1.2 Ensure the default compose path needs no config: `DuckDBGraphLayer` composes to in-memory when `DuckDBConfig` is absent or empty.
- [x] 1.3 Add a one-line boundary test (if schema schema-validation is used) or skip if the config is a plain `Context` service.

## 2. Open a named, durable path

- [x] 2.1 `DuckDBGraphService.make`: read `DuckDBConfig`; call `DuckDBInstance.create(path)` when a non-empty path is provided, else `DuckDBInstance.create()` (in-memory).
- [x] 2.2 Keep `CREATE TABLE IF NOT EXISTS` for the step-log and projection tables so reopening an existing file is idempotent.
- [x] 2.3 Add a `dispose(): Effect.Effect<void>` to the store that `closeSync()`s the instance (wrapped in the effect seam), so a path can be cleanly released for reuse/reopen.

## 3. Rebuild projection on reopen

- [x] 3.1 On open of an existing persisted path, ensure the materialized projection is rebuilt from the retained step log (via the existing `replay()`), so entities/relations/events reflect prior writes (I3/I11).
- [x] 3.2 Confirm `log` returns the persisted steps in order after reopen.

## 4. Durability end-to-end proof

- [x] 4.1 Add `test/graph-persistence.test.ts`: open a store on a throwaway temp path, insert steps (I2), `dispose`.
- [x] 4.2 Reopen the same temp path in a fresh store; assert `log` retains the prior steps in order, `replay` reproduces the same entities/relations/events, and a `relatedness`/`paths` query returns the prior distance-ranked/ordered result.
- [x] 4.3 Use a per-test temp path (mkdtemp-style) and clean it up; confirm the default in-memory instantiation (no path) still needs no file.
- [x] 4.4 Run the full engine suite (`bunx vitest run`) green, plus `tsc --noEmit` (no new errors) and `npm exec -- ultracite check`.

## 5. Docs

- [x] 5.1 Update `docs/SESSION_MEMORY.md`: P2 follow-up complete — graph persistence (`duckdb-graph-persistence`), how to opt in (`DuckDBConfig` path), and that `dispose` releases a path for reopen.
- [x] 5.2 Note the `duckdb-graph-persistence` change and its `graph-persistence` capability spec.