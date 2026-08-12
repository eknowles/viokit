## Why

`DuckDBGraphService` currently opens every store in-memory (`DuckDBInstance.create()` with no path), so the step log — the system of record (I3) — is lost when the process exits. No Viokit data survives between runs, which blocks every durable investigation workflow that needs to reopen a prior investigation's graph. This is the flagged P2 follow-up.

## What Changes

- Add a configurable DuckDB database path to the graph store seam, so a `DuckDBGraphLayer` can be backed by a named, durable database file instead of an anonymous in-memory one.
- Keep the in-memory database as the default (empty/invalid path) so existing tests and fixture layers are unchanged.
- On open of a persisted database, retain the append-only step log (I3/I11) **and** rebuild the materialized projection via `replay`, so the graph state is reproducible across process restarts.
- Prove durability end-to-end: write steps, close the store, reopen on the same path, and confirm `replay`(and queries) return the prior state.

## Capabilities

### New Capabilities
- `graph-persistence`: The graph store can be opened against a named, durable DuckDB database path, preserving the append-only step log across process restarts and reproducing the same folded graph state on reopen.

### Modified Capabilities
- `graph-query`: the retained store's query surfaces (`paths`, `timeline`, `spatial`, `relatedness`) SHALL operate against the persisted projection after reopen, not just against a fresh in-memory instance.

## Impact

- **Code:** `packages/engine/src/graph-duckdb.ts` (open-path config + reopen/rebuild), a new config seam in `packages/schema/src/seams.ts` or a small local config service, and `packages/engine/src/index.ts` exports if new. New persistence test in `packages/engine/test`.
- **Behavior:** default layer unchanged (in-memory); a caller that opts into a persisted path gets durable, replayable graph state.
- **Specs:** new `graph-persistence` capability; verified against `graph-query` after reopen.