## Why

P2 built the transform runner, the DuckDB-backed `GraphStore` (four query surfaces) and the entity correlate resolver — but the `Engine` service seam (`packages/engine/src/engine.ts`) still only exposes `acquire/ingest/insert/log/queryEntity/replay` and wires the in-memory `GraphLayer` fallback. Nothing outside the engine package can reach the graph query surfaces, the transform runner, or entity correlation through the public seam, and the shipped specs (`openspec/specs/*`) predate all of P2 and no longer describe the system that exists. P2 is not repeatable end-to-end until the pipeline is runnable through `Engine` over the real (DuckDB) store.

## What Changes

- Extend the `Engine` service seam (`packages/engine/src/engine.ts`) to expose:
  - the four graph query surfaces: `paths`, `timeline`, `spatial`, `relatedness`;
  - a `runTransform` that threads `TransformRunnerService` (stage steps, commit to a provided graph store);
  - a `correlate` that threads `CorrelateResolverService` against a given `GraphState` and `MatchRule`s.
- Switch `EngineLayer` to wire the real pipeline over `DuckDBGraphLayer` (with the in-memory `GraphLayer` as a documented fallback), so a run exercises DuckDB replay/projection rather than the default in-memory store.
- Add an end-to-end scenario (mini-investigation over `Engine`) that asserts graph insertion, deterministic replay, a query surface result, and a correlate-driven merge against the DuckDB-backed layer.
- Refresh `openspec/specs/engine-runtime/spec.md` (and add delta specs) so the specs describe the P2 behavior actually shipped.

## Capabilities

### New Capabilities
- `graph-query`: The engine exposes `paths`, `timeline`, `spatial`, and `relatedness` over the graph, producing depth-bounded paths, time/spatial extent hits, and distance-ranked related entities.

### Modified Capabilities
- `engine-runtime`: the Engine seam is extended from insert/query/replay to a full pipeline — running a transform to produce attributed steps, committing them to a graph store, correlating staged entities into `ResolveEntity` merges, and querying the resulting graph. Backed by the DuckDB layer by default.

## Impact

- **Code:** `packages/engine/src/engine.ts` (seam + layer wiring), `packages/engine/src/index.ts` exports; new e2e test in `packages/engine/test`. No schema changes required.
- **Dependencies:** `@duckdb/node-api` (already added) becomes a runtime dependency of the default `Engine` layer.
- **Specs:** delta for `engine-runtime`, new `graph-query` capability spec.
- **Docs:** `docs/SESSION_MEMORY.md` (flip `proposed`→`decided` for TDR-015 is already done in-repo; note P2 as complete after this change).