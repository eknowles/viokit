# Tasks — Source Discovery Harness

> Ordered for the `source-discovery-harness` change. Prereq: TDR-013 marked `decided`.

## 1. Shared schema additions
- [ ] Add `SourceCandidate` (R3) + lifecycle `status`, `access`, `transport` enums, typed errors (`ClaimConflict`, `AlreadyPromoted`) to `packages/schema`.
- [ ] Add boundary tests for `SourceCandidate` decode (I6).

## 2. `packages/source-catalog` package scaffold
- [ ] `package.json`, `tsconfig.json`, `vitest.config.ts` following the other packages; workspace registration.
- [ ] Effect service seams: `WorkQueue`, `CandidateStore`, `Promoter` (narrow interfaces, TDR-013 store behind them).

## 3. WorkQueue (R1)
- [ ] Seed logic: categories × archetypes from the OSINT catalog (+ optional Bellingcat CSV).
- [ ] Atomic `claim_work(agent)` (compare-and-set) with TTL lease.
- [ ] `release_work(id)` and lease-expiry reopen pass.
- [ ] Tests: two agents never both win the same unit; expired lease reopens.

## 4. CandidateStore (R2/R3)
- [ ] SQLite backend (TDR-013) with unique fingerprint index.
- [ ] `submit_candidate` insert-or-merge (union archetypes/notes, append provenance, keep first `url`).
- [ ] `enrich_candidate`, `list_candidates` (filter by category/archetype/status).
- [ ] Supersede path (immutable history).
- [ ] Tests: cross-agent merge dedup; race-safe insert; supersede immutability.

## 5. Promoter (R4)
- [ ] `promote_source(id, spec)` writes `SourceSpec` to `packs/<category>/sources.ts`; marks `promoted`.
- [ ] Promote-once + idempotent (`AlreadyPromoted`).
- [ ] Tests: write shape + type-check; double-promotion rejected.

## 6. Front-ends (R5)
- [ ] Effect service wiring for the five operations.
- [ ] MCP server exposing `claim_work`, `submit_candidate`, `enrich_candidate`, `list_candidates`, `promote_source`.
- [ ] CLI mapping the same calls.
- [ ] Tests: MCP tool round-trips.

## 7. Seed + verification
- [ ] Seed work queue; optional Bellingcat CSV ingestion.
- [ ] `tsc --noEmit`, `vitest run`, `npm exec -- ultracite check`.
- [ ] Invariant checklist (CONTRACT.md) — I6, I8, I9 especially.
