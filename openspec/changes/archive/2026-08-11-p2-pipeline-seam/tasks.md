# Tasks — P2 Pipeline Seam

> Ordered to first thread the services through the `Engine` seam, then switch the default layer to DuckDB, then prove it end-to-end. Prereq: P2 services (`transform`, `graph-duckdb`, `correlate`) merged (in-repo).

## 1. Extend the Engine seam

- [x] 1.1 Add the four graph query methods (`paths`, `timeline`, `spatial`, `relatedness`) to the `Engine` service signature, delegating to the injected `GraphStore` interfaces.
- [x] 1.2 Add `runTransform(spec, source, project, input)` to delegate to `TransformRunnerService.run` and return `Effect<readonly Step[], …>`.
- [x] 1.3 Add `correlate(staged, existing, rules)` to delegate to `CorrelateResolverService.resolve`.
- [x] 1.4 Implement the new pass-throughs in `EngineLayer`'s `make`, injecting `TransformRunnerService`, `CorrelateResolverService`, and the `GraphStore` query methods.
- [x] 1.5 Widen the `Engine` import/type usage in `engine.ts` to the new seam surface (no schema changes).

## 2. Wire the default layer to DuckDB

- [x] 2.1 Switch `EngineLayer`'s default graph dependency from `GraphLayer` to `DuckDBGraphLayer`; keep `GraphLayer` exported as the documented in-memory fallback.
- [x] 2.2 Ensure `engine.ts` exports are unchanged/clean (re-export runTransform/correlate/query surface types if needed via `index.ts`).
- [x] 2.3 Verify the existing `engine.test.ts` still type-checks and passes against the new default layer (or adjusts fixtures to use the in-memory `GraphLayer` where tests assert in-memory behavior).

## 3. End-to-end proof over the DuckDB-backed Engine

- [x] 3.1 Add `test/pipeline-seam.test.ts`: run a source through `Engine.runTransform` → `correlate(staged, …)` → `insert` → `replay`, mirroring the mini-investigation flow but over the default `Engine` layer.
- [x] 3.2 Assert: steps are attributed to evidence (I2); replay is deterministic (I3); a graph `relatedness` (or `paths`) query returns the expected distance-ranked result over DuckDB; and a `ResolveEntity` merge is produced when a staged identifier normalizes to an existing one.
- [x] 3.3 Run the full engine suite (`bunx vitest run`) green, plus `tsc --noEmit` and `npm exec -- ultracite check`.

## 4. Docs & spec refresh

- [x] 4.1 Update `docs/SESSION_MEMORY.md`: P2 marked complete, note the `Engine` seam + DuckDB-default layer, and the next P2 follow-up (file/step-log persistence).
- [x] 4.2 Note the `p2-pipeline-seam` change and its specs (threshold for TDR-015 correlated graphs exercised through `Engine`).