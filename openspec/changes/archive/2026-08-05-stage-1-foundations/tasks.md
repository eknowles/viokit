# Stage 1 — Foundations, deepened (tasks)

## 1. Filesystem evidence backend (`packages/engine`)

- [x] 1.1 Add an injectable filesystem backend (root-directory abstraction) to `EvidenceStore` seam tooling; validate the root path at the boundary
- [x] 1.2 Implement content-addressed write-once: file named by content-hash id, atomic create that fails if the id already exists (write-once, I1)
- [x] 1.3 Implement `get` by id (missing id → not-found) and `list` backed by a sidecar manifest that is rebuildable from files
- [x] 1.4 Wire `EvidenceLayer` to select in-memory vs filesystem backend by config (backend swap, no interface change)
- [x] 1.5 Tests: dedup identical bytes to one id, immutable after write, read-after-reopen persists across a restart (temp dir), missing id not-found

## 2. Ontology registry (`packages/engine`)

- [x] 2.1 Add `OntologyRegistry` Context.Service (register / get / validate) operating on core primitive Entity/Relation/Event definitions
- [x] 2.2 Validate registered definitions against the core primitive schemas before registration; reject non-conforming definitions
- [x] 2.3 Reject duplicate registration; unknown-name lookup returns not-found
- [x] 2.4 Tests: register + lookup, duplicate rejected, invalid definition rejected, unknown lookup not-found

## 3. Primitive suite + replay round-trips (`packages/schema` + `packages/engine`)

- [x] 3.1 Extend schema tests to full encode→decode round-trips for the primitive suite (Identifier, Entity, Relation, Event, temporal/spatial extent)
- [x] 3.2 Add store→replay round-trip tests: put evidence → build step → insert → replay reproduces state against the filesystem backend
- [x] 3.3 Confirm boundary tests continue to enforce I1, I2, I5, I6 (content-hash identity, provenance closure, temporal validity, conformance)

## 4. Exit checklist

- [x] 4.1 Run `ultracite check`, `tsc --noEmit`, and vitest; all green
- [x] 4.2 Run the invariant checklist (CONTRACT I1–I12); update docs if behavior changed
- [x] 4.3 Update `STAGED_BUILD.md`/`ROADMAP.md` checkpoints for the completed Stage-1 exit proof
