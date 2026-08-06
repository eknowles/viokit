# Tasks — Source Discovery Harness

> Ordered for the `source-discovery-harness` change. Prereq: TDR-013 marked `decided`.

## 1. Shared schema additions
- [x] Add `SourceCandidate` (R3) + lifecycle `status`, `access`, `transport` enums, typed errors (`ClaimConflict`, `AlreadyPromoted`) to `packages/schema`.
- [x] Add boundary tests for `SourceCandidate` decode (I6).

## 2. `packages/source-catalog` package scaffold
- [x] `package.json`, `tsconfig.json` following the other packages; workspace registration (uses `bun test`, not vitest — vitest 4 can't load `bun:sqlite`).
- [x] Effect service seams: `WorkQueue`, `CandidateStore`, `Promoter` (narrow interfaces, TDR-013 store behind them).

## 3. WorkQueue (R1)
- [x] Seed logic: categories × archetypes from the OSINT catalog (+ optional Bellingcat CSV).
- [x] Atomic `claim_work(agent)` (compare-and-set) with TTL lease.
- [x] `release_work(id)` and lease-expiry reopen pass.
- [x] Tests: two agents never both win the same unit; expired lease reopens.

## 4. CandidateStore (R2/R3)
- [x] SQLite backend (TDR-013) with unique fingerprint index.
- [x] `submit_candidate` insert-or-merge (union archetypes/notes, append provenance, keep first `url`).
- [x] `enrich_candidate`, `list_candidates` (filter by category/archetype/status).
- [x] Supersede path (immutable history).
- [x] Tests: cross-agent merge dedup; race-safe insert; supersede immutability.

## 5. Promoter (R4)
- [x] `promote_source(id, spec)` writes `SourceSpec` to `packs/<category>/sources.ts`; marks `promoted`.
- [x] Promote-once + idempotent (`AlreadyPromoted`).
- [x] Tests: write shape + type-check; double-promotion rejected.

## 6. Front-ends (R5)
- [x] Effect service wiring for the five operations.
- [x] MCP server exposing `claim_work`, `submit_candidate`, `enrich_candidate`, `list_candidates`, `promote_source`.
- [x] CLI mapping the same calls.
- [x] Tests: MCP tool round-trips (via `Client` + `InMemoryTransport`, temp-file-backed sqlite for shared state).

## 7. Seed + verification
- [x] Seed work queue; optional Bellingcat CSV ingestion.
- [x] `tsc --noEmit`, `bun test`, `npm exec -- ultracite check`.
- [x] Invariant checklist (CONTRACT.md) — I6, I8, I9 especially (I6 decode-at-boundary via shared `@viokit/schema`; I8 MCP+CLI share `SourceCatalogService`/`SourceCatalogProgramLayer`; I9 N/A — no evidence/step records produced).
