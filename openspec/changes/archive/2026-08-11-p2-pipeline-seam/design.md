## Context

P2 delivered the transform runner (`TransformRunnerService`), the DuckDB-backed `GraphStore` (`graph-duckdb.ts`, four query surfaces: `paths/timeline/spatial/relatedness`), and the correlate resolver (`CorrelateResolverService`) as separately-usable services. See proposal.md — Why for motivation. The `Engine` seam (`engine.ts`) and its default layer are the only thing that has not caught up: they expose only `acquire/ingest/insert/log/queryEntity/replay` and wire the in-memory `GraphLayer`.

The effect is a Ender at the seam boundary: what is runnable through `Engine` vs. what the engine package shipped are two different things. This change threads the P2 services through `Engine` and wires the default layer over the retained DuckDB store, then proves it with an end-to-end scenario.

## Goals / Non-Goals

**Goals:**
- Expose `paths`, `timeline`, `spatial`, `relatedness`, `runTransform`, and `correlate` on the `Engine` service seam.
- Make the default `EngineLayer` run on `DuckDBGraphLayer` (with in-memory fallback preserved).
- Prove the full pipeline through `Engine` with an e2e scenario over the DuckDB-backed layer.

**Non-Goals:**
- No schema changes.
- No change to the graph store implementations themselves (already shipped in P2).
- No introduction of the graph query surfaces to the web UI (P3).
- No new match rules / domain content (open-domain rule; pack work is P4).

## Decisions

**D1 — Expose thin pass-throughs on `Engine`, not new orchestration.**
Each new `Engine` method delegates to the underlying service: `runTransform(spec, source, project, input)` → `TransformRunnerService.run`; `correlate(staged, existing, rules)` → `CorrelateResolverService.resolve`; and the four query methods → the analogous `GraphStore` methods. `Engine` stays a composition root, not a re-implementation. Alternatives considered: baking transform→commit→correlate into a single `Engine.run()` — rejected because commit vs. correlate ordering is a domain/pack concern (a pack may want to correlate before committing), so the seam keeps the stages separable.

**D2 — Commit step stays explicit.**
`runTransform` returns staged steps (as the runner already does) and the caller commits via the existing `insert`/a batch insert. This preserves the append-only step model (I3) and lets a pack call `correlate(staged, …)` before `insert`. The e2e exercises the sequence `runTransform → correlate → insert → replay/query`.

**D3 — DuckDB as default, in-memory as fallback.**
`EngineLayer` composes `DuckDBGraphLayer` by default. The in-memory `GraphLayer` remains exported for tests/fixtures and is selectable by callers who override the `GraphStore` dependency. Rationale: TDR-005 chose DuckDB; the default layer should exercise the real store's replay/projection. A file-backed step log is a stated follow-up and out of scope here (see Risks).

## Risks / Trade-offs

- **In-memory DuckDB (fresh per process) in the default layer** → the retained store is ephemeral within a process until file persistence lands; that is unchanged from P2 and acceptable for the seam/exit-gate. Mitigation: document that file/step-log persistence is the next P2 follow-up.
- **`runTransform` I/O and async DuckDB calls (`Effect.tryPromise` + `mapError`)** → must be surfaced through the seam's union error type (e.g. `TransformError`). Mitigation: the e2e asserts error surfacing is typed, not swallowed.
- **Widening the `Engine` seam increases surface to keep in sync across store layers** → both `GraphService` (in-memory) and `DuckDBGraphService` already implement the same `GraphStore` interface (seam parity), so the pass-throughs are identical regardless of layer. Low risk.
- **Correlate ordering ambiguity** → mitigate by keeping transform/commit/correlate as separable steps (D2) and encoding an explicit order in the e2e.