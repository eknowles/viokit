# TDR-006 — Cache backends: filesystem vs Redis vs object store

- **Status:** decided
- **Owner:** core
- **Date:** 2026-08-05
- **Related:** TDR-001 (runtime), TDR-007 (evidence store), ROADMAP P1, STAGED_BUILD.md Stage 2; CONTRACT I9 (cache transparency), I11 (offline determinism), I4/I10 (runtime policy)

## Decision summary
> Implement the source-response cache behind a `CacheStore` seam, with an **in-memory L1 + local filesystem (on-disk) L2** as the first backend for standalone use, matching the runtime (TDR-001, Bun/Node) and evidence-store (TDR-007, filesystem-first) posture. **Redis (shared L2) and S3/MinIO (L3)** are deferred behind that same seam for the shared Compose/K8s topology.

## Context
- The source pipeline needs a read-through response cache that serves prior acquisitions and, in `cache-only` mode, disables egress entirely — offline determinism (**I11**).
- Cache hits are *still evidence* with full provenance (**I9**): every acquisition records `acquisitionPath` (`live`/`cache`/`proxy`) and the origin fetch reference; cached results are timestamped snapshots (the 4D "what did the internet return on date X" angle).
- Cache and egress are **runtime policy stages**, never transform/UI logic (I4/I10). Cache keys are request fingerprints (`sha256(sourceId · sourceVersion · transport · normalizedRequest)`) with auth material stripped; secrets never enter the cache (governance, write-time redaction).
- Deployment spans single-node standalone and, later, shared Compose/K8s. The choice must not couple core to a specific service and must allow a backend swap without an interface change (the anti-rework lever from `STAGED_BUILD.md`).
- Constraints: Effect v4 + schema-first; every boundary decoded/validated; cache values are raw source responses (arbitrary bytes) plus normalized records; must support `ttl`/`maxStale`, modes (`live-only`/`cache-first`/`cache-only`/`refresh`), and invalidation (ETag/Last-Modified/Retry-After, explicit purge).

## Options considered
### Option A — Filesystem on-disk L2 (in-memory L1)
- **Description:** A `CacheStore` seam; L1 is an in-process Map, L2 persists entries as files (keyed by request fingerprint) under a configured directory. Matches TDR-007's content-addressed filesystem story.
- **Pros:** zero external infra (fits TDR-001 standalone Bun/Node); simple, inspectable, auditable (cache is a first-class evidentiary resource); survives restart (durable cold start); trivially the lowest ops cost; clean seam swap to Redis later.
- **Cons:** not shared across nodes; a single-node cache (acceptable for standalone Stage-2 exit proof); no built-in expiry/eviction beyond app logic.

### Option B — Redis (shared L2 / L3)
- **Description:** Entries in a Redis instance, keyed by request fingerprint, with TTL enforced by the store.
- **Pros:** shared across workers (Compose/K8s); mature TTL/eviction; good hit-rate at scale; standard.
- **Cons:** requires running Redis even for a standalone/single-node install — heavy for Stage 2's thin proof; adds a service dependency and ops surface now; not inspectable as plain files; premature until a shared topology exists.

### Option C — Object store S3/MinIO (L3, durable org-wide cache)
- **Description:** Entries as objects keyed by request fingerprint; S3-compatible API (AWS S3 or MinIO).
- **Pros:** durable org-wide cache; cold-start cache across a fleet; scales.
- **Cons:** heaviest to run (MinIO) and to operate; clearly a later-tier concern; couples early deployments to a service not yet needed.

### Option D — SQLite cache table
- **Description:** Cache entries as a table in a SQLite file.
- **Pros:** single file, transactional, simple; TTL easily modelled.
- **Cons:** a DB runtime for what is primarily a response store; mixes the durable-layout decision into cache rather than the DB TDRs (TDR-005); filesystem is simpler and more inspectable for raw responses.

## Evaluation criteria
1. Fit with Effect/schema-first architecture (must be a clean seam swap)
2. Ecosystem maturity & maintenance
3. Licensing & supply-chain risk
4. Performance / scale behaviour (large result sets, cold start, hit rate)
5. Ops & deployment cost (standalone → K8s)
6. Effort to integrate / learn

## Analysis
- **Fit (1):** A `CacheStore` seam hides all four backends. Filesystem and Redis are the cleanest fingerprint → key mappings; SQLite introduces a DB runtime; object store is the natural L3.
- **Ecosystem (2)/Licensing (3):** Filesystem and SQLite are zero-dependency; Redis (BSD) and MinIO (AGPL for MinIO server, OSS variant) are mature but add services; a server dependency for the Stage-2 standalone proof is disproportionate.
- **Scale (4):** Redis and object store win at shared scale; filesystem wins for durable single-node cold start and matches the content-addressed precedent; SQLite is middle.
- **Ops (5):** Filesystem is the lowest ops cost and the only one needing **no running service** — decisive for the Stage-2 standalone exit proof. Redis/S3/MinIO are the shared-layout answers but premature now.
- **Effort (6):** Filesystem is lowest to integrate and directly validates the cache seam; it also mirrors the TDR-007 filesystem-first decision, keeping the runtime story consistent.

Trade-off made explicit: we accept a per-node (not shared) cache in exchange for zero-infra simplicity and a direct validation of the cache seam. Redis (shared L2) and object store (L3) stay behind the same seam for the shared/cloud topology, so this is a **soft** choice — swapping is a backend change, not a contract change. This mirrors how TDR-007 treats the evidence store.

## Recommendation
- **Chosen:** a `CacheStore` seam with **in-memory L1 + filesystem on-disk L2** as the first durable backend (Option A). Redis (Option B) becomes the shared L2 backend and S3/MinIO (Option C) the L3 backend behind the same seam when a shared/cloud layout is required; SQLite (Option D) is not pursued for cache (it belongs to the DB-store decision space of TDR-005). Keying is by request fingerprint with auth material stripped; secrets never cached; cache usage recorded as evidence per I9.
- **What would change this decision:** a production requirement for a shared, multi-node cache before we reach that stage, or cache volumes exceeding a single node's practical scope. Either is re-evaluated via a superseding TDR, not a silent change.

## Open questions
- (Resolved during Stage 2 implementation) Exact on-disk layout for the filesystem cache (fingerprint-sharded directories vs flat + index) and expiry/eviction policy (`ttl`/`maxStale` enforcement, LRU bounds).
- (Resolved during Stage 2 implementation) Whether normalized records and raw responses share one cache store or separate buckets.

## References
- `STAGED_BUILD.md` Stage 2; `ROADMAP.md` P1; `openspec/exploration/03-system-architecture.md` §4 (cache tier); `openspec/decisions/README.md` TDR-006 row; CONTRACT I4/I9/I10/I11.
