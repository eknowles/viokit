# TDR-013 — Source-catalog store: SQLite vs filesystem vs in-memory

- **Status:** in-review
- **Owner:** core
- **Date:** 2026-08-05
- **Related:** TDR-001 (runtime), TDR-006 (cache), TDR-007 (evidence store); ROADMAP P1; STAGED_BUILD.md Stage 2; CONTRACT I8 (agent parity), I9 (provenance); `openspec/exploration/02-osint-landscape.md` §4/§5 (machine-readable source index)

## Decision summary
> (Fill in when decided.) Lean: a `CandidateStore` + `WorkQueue` behind narrow seams, backed by **SQLite** as the first backend, for atomic compare-and-set claims and durable, concurrency-safe dedup in the multi-agent source-discovery harness.

## Context
- The **source-discovery harness** (`packages/source-catalog`) lets many agents, in parallel, discover, classify, and document potential OSINT sources (from the Bellingcat toolkit, open datasets, APIs). Each agent: claims a work unit → runs its own search → submits a lightweight `SourceCandidate` → (later) promotes to a `SourceSpec` written into a pack.
- To get coverage fast without agents stepping on each other, the store must support **atomic claim/lease** on work units (compare-and-set) and **content-hash dedup** on candidate identity, so identical submissions collapse across agents.
- It is a **dev/curation-time** catalog, not the runtime evidence/cache/graph store. It does not hold raw evidence or run source pipelines; it feeds `SourceSpec` definitions to packs.
- Constraints: Effect v4 + schema-first (I6 decode at every boundary); must survive restarts (agents are long-running and may crash mid-scan); should require **no running service** for standalone/dev use (consistent with TDR-001 Bun/Node, TDR-006 filesystem-first, TDR-007 filesystem-first posture); a backend swap must not change the seam.

## Options considered
### Option A — SQLite (single file)
- **Description:** `CandidateStore`/`WorkQueue` as tables in a SQLite file; claims are atomic `UPDATE ... WHERE status='open'` transactions; candidates keyed by a unique hash fingerprint.
- **Pros:** real ACID transactions give atomic compare-and-set claims and leases for free; durable across restarts; single-file, zero-running-service (fits standalone); excellent concurrency semantics for the multi-agent case; trivially inspectable/auditable; a `better-sqlite3`/Effect-platform binding is small and stable.
- **Cons:** a DB runtime in a dev-time tool; the graph-store TDR (TDR-005) already plans SQLite standalone — this adds a second SQLite surface (acceptable, they are unrelated stores); needs an Effect-managed connection.

### Option B — Filesystem with advisory locks (JSONL + lockfile)
- **Description:** candidates as append-only JSONL files keyed by hash; a lockfile (or atomic file-create) mediates claims.
- **Pros:** zero dependencies; matches the filesystem-first precedent; simple and transparent.
- **Cons:** **atomic compare-and-set claims are hand-rolled and error-prone** (file locks, lease expiry, partial writes); concurrency across multiple live agents is exactly where a plain filesystem is weakest; dedup race (two agents read-same-hash, both write) is hard to make safe. Wrong tool for the stated multi-agent requirement.

### Option C — In-memory (Map) only
- **Description:** store lives in-process; no persistence.
- **Pros:** trivial; fine for a single-process demo.
- **Cons:** agents are assumed to be separate processes (MCP clients), so in-memory gives **no shared state** — defeats the entire dedup/claim purpose. Only viable as a test seam, not the real backend.

## Evaluation criteria
1. Fit with Effect/schema-first architecture (clean seam swap)
2. Multi-agent concurrency correctness (atomic claims, safe dedup)
3. Durability & restarts (agents crash; scans resume)
4. Ops & deployment cost (standalone/dev; no running service)
5. Ecosystem maturity & supply-chain/licensing risk
6. Effort to integrate / learn

## Analysis
- **Concurrency (2) is the decisive criterion** and it is exactly what the harness exists for. SQLite transactions give atomic claims, leases, and hash-unique dedup without custom locking; filesystem-forced ordering across N independent agent processes is fragile; in-memory is not shared at all. → SQLite clearly wins.
- **Fit (1):** all three sit behind the same `CandidateStore`/`WorkQueue` seams; SQLite is the cleanest to make effectful and schema-validated at the boundary (I6).
- **Durability (3):** SQLite and filesystem persist; in-memory does not. Agents are long-running and crash-prone, so durability matters for resuming a scan without losing submitted candidates.
- **Ops (4):** SQLite (single file) and filesystem need no running service; both fit standalone. SQLite adds a file + a small binding but no daemon.
- **Ecosystem/licensing (5):** SQLite (public domain) and `better-sqlite3` (MIT) are mature; the Effect-platform SQLite integration keeps it schema-first. Low risk.
- **Effort (6):** SQLite is slightly more than a Map but not materially harder than hand-rolling safe file locking — and it removes the entire class of concurrency bugs the filesystem option would invite.

Trade-off made explicit: we accept a DB file + a small Effect-managed connection in exchange for correct multi-agent concurrency and durable dedup — the two properties the harness is built to deliver. Filesystem remains the fallback if SQLite is deemed too heavy for dev-time use; in-memory is kept only as the test seam.

## Recommendation
- **Chosen:** a `CandidateStore` + `WorkQueue` behind narrow seams, backed by **SQLite (single file)** as the first backend (Option A). In-memory (Option C) is retained purely as the test seam; filesystem-with-locks (Option B) is the documented fallback if SQLite is rejected. This is a **soft** choice behind a seam — swapping to a filesystem or a shared backend later is a backend change, not a contract change, matching the anti-rework lever from `STAGED_BUILD.md`.
- **What would change this decision:** a requirement to share the source catalog across a fleet at runtime (then a shared backend like Postgres behind the same seam), or evidence that SQLite's dev-time overhead outweighs the concurrency benefit for the expected single-operator agent swarm.

## Open questions
- (Resolved during implementation) Exact SQLite layout: tables (`work_units`, `candidates`, `promotions`) and the claim/lease SQL (compare-and-set + TTL refresh).
- (Resolved during implementation) Effect-managed SQLite binding choice (Effect-platform SQLite vs `better-sqlite3` wrapper).

## References
- `openspec/decisions/README.md` TDR-013 row; TDR-001/006/007; `STAGED_BUILD.md` Stage 2; `ROADMAP.md` P1; CONTRACT I8/I9.
