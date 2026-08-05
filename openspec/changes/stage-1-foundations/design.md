# Stage 1 — Foundations, deepened (design)

## Context

See `proposal.md` (why/what). Stage 0 delivered `packages/schema` (primitives + capability seams `EvidenceStore`/`GraphStore`/`SourceRuntime`), `packages/engine` (in-memory stores), and `packages/sources` (HTTP). The engine core must stay **primitives-only** (open-domain rule) and every boundary must be Effect-Schema-validated. TDR-007 (filesystem evidence backend) is now `decided`. No new seams are introduced in this stage.

## Goals / Non-Goals

- **Goals:** durable evidence (filesystem, content-addressed, write-once) behind the existing `EvidenceStore` seam; a runtime ontology registry (register/validate type definitions) in core; full primitive encode→decode→store→replay round-trip test coverage; I1/I2/I5/I6 enforced by boundary tests.
- **Non-Goals:** no UI, transforms, cache, egress, or graph-storage work (Stages 2–3); no new dependency (e.g., no S3/MinIO yet — deferred behind the seam); no domain packs (they are separate, pack-shaped work).

## Decisions

### D1 — Filesystem store layout: hash-addressed files + sidecar manifest
- **Choice:** evidence written as a file named by its content-hash id (hex), with an atomic write-once create (fail if the file already exists), plus a small sidecar manifest for listing (id → metadata). A lightweight two-hex-character shard prefix keeps directories from growing unbounded.
- **Alternatives considered:** flat single directory (simplest, but poor listing scale); a full index/DB (overkill; DB concerns belong to TDR-005's decision space, not evidence).
- **Rationale:** filename = content hash preserves I1 naturally; O_EXCL-style create enforces write-once; a manifest is decoupled so it can be swapped later without touching the seam. Filesystem ops stay behind an injectable backend so tests use a temp dir.

### D2 — Backend abstraction reuses the Stage-0 `EvidenceStore` seam
- **Choice:** the filesystem store implements the existing `EvidenceStore` interface (`put`/`get`/`list`); `EvidenceLayer` becomes a layer that selects the backend (in-memory vs filesystem) by config.
- **Rationale:** this is a backend swap, not an interface change (the anti-rework lever from `STAGED_BUILD.md`). Engine and sources are untouched.
- **Alternatives:** a parallel store type — rejected; it would fork the seam.

### D3 — Ontology registry as an Effect service in core
- **Choice:** an `OntologyRegistry` Context.Service holding registered type definitions (Effect Schema), with `register`/`get`/`validate`; definitions are validated against the core primitive `Entity`/`Relation`/`Event` schemas before registration. Primitives-only: no domain types exist in core.
- **Alternatives:** static/compile-time registry — rejected (must be runtime-registerable per the open-domain/pack model); a separate package — rejected (registry is engine-core concern).
- **Rationale:** keeps packs able to register types at runtime while core stays primitive-only; matches the Effect service pattern already used for stores.

### D4 — Persistence proofs run against a temp directory, not the repo
- **Choice:** evidence persistence tests (restart/reopen) create and reuse a temp dir via an injectable path, then clean up; they never write into the repository.
- **Rationale:** hermetic, repeatable, and safe; consistent with the Stage-0 example's offline approach.

## Risks / Trade-offs

- [Manifest can drift from files] → Manifest is derived/rebuildable from files on open; a rebuild is the recovery path.
- [Filesystem layout is a soft choice] → S3/MinIO later is a backend swap behind the same seam (TDR-007 already scoped this).
- [Runtime registry could be misused to put domain types in core] → The registry only accepts definitions conforming to core primitives; the invariant checklist gates commits.

## Migration Plan

- Additive: new files (`evidence-fs.ts`, `ontology.ts`) + schema additions; existing in-memory store and engine/sources are unchanged. Rollback = revert the stage-1 commit(s); nothing existing breaks.

## Open Questions

- Whether the manifest should be a single JSON file vs a directory of per-id entries; resolved during implementation without affecting the seam or the specs (listing behavior is identical).
