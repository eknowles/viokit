# TDR-007 — Evidence store backend: filesystem vs S3/MinIO

- **Status:** decided
- **Owner:** core
- **Date:** 2026-08-05
- **Related:** CONTRACT I1 (content hash = identity), STAGED_BUILD.md Stage 1, ROADMAP P0/P1; seam: `EvidenceStore` in `packages/schema/src/seams.ts`

## Decision summary
> Implement the evidence store as a **filesystem-backed, content-addressed store** (a local directory) for standalone use, with **S3/MinIO** added later as a shared-store backend behind the same `EvidenceStore` seam. Filesystem is the first backend.

## Context
- The engine needs a durable evidence store that preserves **I1**: evidence is content-addressed (the stored id *is* the hash of the raw bytes), write-once, and immutable.
- Stage 0 proved the in-memory `EvidenceStore` seam. Stage 1 must swap in a durable backend **without changing the seam** — a backend swap, not an interface change.
- Deployability spans a single-node standalone layout and, later, a shared Compose/K8s layout. The choice must not couple the core to a specific cloud.
- Constraints: Effect v4 + schema-first; every boundary decoded/validated; evidence bytes are arbitrary (any content type); provenance path recorded per acquisition (I9).

## Options considered
### Option A — Filesystem (local directory), content-addressed
- **Description:** Evidence written as files named by content hash under a configured directory; an index/manifest for retrieval; atomic write-once (create with O_EXCL semantics).
- **Pros:** zero infra; simple, auditable (files are inspectable); naturally content-addressed by filename; works standalone and in K8s via a volume; cheap to swap to S3 later behind the seam.
- **Cons:** no built-in dedup across nodes; shared multi-node access needs a real object store or NAS; not a scalable blob service for very large volumes.

### Option B — S3 / MinIO (object store)
- **Description:** Evidence as objects keyed by content hash in a bucket; S3-compatible API (AWS S3 or MinIO for self-hosted).
- **Pros:** scalable, shared across nodes, standard; content-addressing maps directly to object keys; durability + retention tooling.
- **Cons:** requires running an object store (MinIO) even for a standalone/single-node install — heavy for Stage 1's thin proof; more ops surface now; couples early deployments to a service we don't yet need.

### Option C — SQLite (blob table)
- **Description:** Evidence bytes as BLOBs in a SQLite table keyed by hash.
- **Pros:** single file, transactional, simple deployment; good for small/medium volumes.
- **Cons:** less naturally content-addressed/immutable than files; blobs sit outside the filesystem's inspection story; a separate durable-layout decision best deferred to the graph/DB TDRs (TDR-005), not entangled with evidence.

## Evaluation criteria
1. Fit with Effect/schema-first architecture (must be a clean seam swap)
2. Ecosystem maturity & maintenance
3. Licensing & supply-chain risk
4. Performance / scale behaviour (large evidence volumes, immutable writes)
5. Ops & deployment cost (standalone → K8s)
6. Effort to integrate / learn

## Analysis
- **Fit (1):** All three hide behind `EvidenceStore`; filesystem and S3 are the cleanest content-address → key/name mappings. SQLite fits but introduces a DB runtime for what is a blob store.
- **Ecosystem (2)/Licensing (3):** Filesystem and SQLite are zero-dependency; S3/MinIO are mature with permissive licenses, but add a service dependency.
- **Scale (4):** S3 wins at scale and across nodes; filesystem wins for immutable, content-addressed single-node; SQLite is adequate but middle.
- **Ops (5):** Filesystem is the lowest ops cost and the only one that needs *no* running service — critical for the Stage 1 thin proof and standalone use. S3/MinIO is the shared-layout answer but premature now.
- **Effort (6):** Filesystem is the lowest to integrate and directly validates the seam.

Trade-off made explicit: we accept a per-node (not shared) store in exchange for zero-infra simplicity and a direct validation of the content-address seam. The S3 object-store layout stays behind the same seam for the shared/cloud topology, so this is a **soft** choice — swapping is a backend change, not a contract change.

## Recommendation
- **Chosen:** Filesystem content-addressed store as the first durable evidence backend (Option A). S3/MinIO (Option B) becomes the shared-store backend behind the same `EvidenceStore` seam when a shared/cloud layout is required; SQLite is not pursued for evidence (it belongs to the DB-store decision space of TDR-005).
- **What would change this decision:** a production requirement for multi-node shared evidence access before we reach that stage, or evidence volumes that exceed a single filesystem's practical scope. Either would be re-evaluated via a superseding TDR, not a silent change.

## Open questions
- Exact on-disk layout (hash-hierarchy sharding vs flat + index) and whether a sidecar manifest/index is needed for listing; resolve during Stage 1 implementation.

## References
- `STAGED_BUILD.md` Stage 1; `ROADMAP.md` P0; `openspec/decisions/README.md` TDR-007 row; CONTRACT I1/I9.
