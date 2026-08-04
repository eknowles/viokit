## Context

See `proposal.md` (Why/What). The engine is greenfield; no `packages/` exist today. Constraints
from `references/CONTRACT.md`: invariants I1–I12, capability boundaries, open-domain rule; from
`TDR-001` the runtime is Bun with Node as a drop-in. Every boundary is Effect-Schema-encoded and
validated.

## Goals / Non-Goals

**Goals:**
- Prove the two most rework-prone seams — the shared schema and the source pipeline — with the
  smallest possible surface.
- Establish a `packages/` monorepo layout that later stages extend without rework.
- Leave every heavy backend (graph DB, cache, S3) behind a narrow interface, unimplemented here.

**Non-Goals:**
- No cache/egress policy, no full `SourceSpec` policy surface (Stage 2).
- No graph database or storage backend selection (TDR-005 deferred to Stage 3).
- No transforms, UI, API/CLI/MCP, or domain packs.

## Decisions

**D1 — Three packages, one per seam.**
`packages/schema` (contract), `packages/engine` (in-memory realization + orchestration),
`packages/sources` (HTTP source). Rationale: maps 1:1 to the capability boundaries in CONTRACT so
later stages deepen a package rather than restructure. Alternatives: a single package (fails to
enforce boundaries); splitting by store (premature — only one backend exists).

**D2 — In-memory implementations behind interface types.**
Every store seam (`EvidenceStore`, `GraphStore`, `SourceRuntime`) is a TypeScript interface defined
in `packages/schema`. `packages/engine` provides in-memory implementations. Rationale: makes the
later Postgres/SurrealDB/Neo4j swap a backend change, not an interface change (the "minimal changes
later" lever). Alternatives: filesystem-backed now (adds I/O before the contract is proven).

**D3 — Content hash = id for evidence.**
Evidence ids are derived from raw bytes at write time. Rationale: enforces I1 (immutability) at the
type level. Implemented via a deterministic hash over the encoded bytes; storage maps id → bytes.

**D4 — Pipeline is a fold over the step log.**
The engine records every insert as an append-only `Step` in a log; graph state is derived by folding
the log. Rationale: replay (I3) is free — replay equals re-fold. Alternatives: materialize graph in
place (breaks replay determinism).

**D5 — Bun + Effect v4 aligned set (TDR-001).**
Pin an `effect@beta`-compatible dependency set in `packages/schema` and share across the workspace.
Node remains a drop-in via the Effect platform.

**D6 — One real HTTP source, wired through the runtime.**
A simple public API demonstrates `SourceSpec → fetch → Evidence(acquisitionPath) → graph insert` for
real, proving I9 (acquisition path) and the source seam. Alternatives: a stub source (fails to
exercise real I/O path).

## Risks / Trade-offs

- [Runtime pins (Effect beta set) drift between Stage 0 and later stages] → pin exact versions in
  `package.json` and record them in the decisions index.
- [In-memory seam masks performance issues] → acceptable; Stage 3's backend swap is where
  performance is validated, and the interface isolates it.
- [One HTTP source risks coupling to a live, third-party API] → make the source dependency
  injectable/configurable and mockable in tests so CI is deterministic.
- [Hand-rolling the pipeline vs adopting an orchestration lib] → keep the pipeline hand-rolled and
  Effect-native for now; YAGNI until a second transport demands abstraction.

## Migration Plan

No production migration (greenfield). Rollback is `git revert`. The `packages/` layout and the
shared schema are the durable artifacts; anything not in `packages/schema` is internal to the spine.

## Open Questions

None that would change the specs or approach. (Backend choices are deferred by design; see D2.)
