# Stage 1 — Foundations, deepened

## Why

Stage 0 proved the thin spine (in-memory seams, one HTTP source, replay). Stage 1 deepens P0 foundations so the core is durable and self-describing: evidence must survive restarts (filesystem backend, per TDR-007), and the engine needs a runtime ontology registry so types can be registered and validated without baking domain types into core (open-domain rule).

## What Changes

- **Filesystem evidence backend** behind the existing `EvidenceStore` seam (in-memory → filesystem swap; no interface change). Content-addressed, write-once, immutable (I1); list/read by id; atomic create.
- **Ontology registry**: register + validate `Entity`/`Relation`/`Event` type definitions at runtime; primitives-only core; no domain types in `packages/*` core.
- **Primitive suite + replay hardening**: full encode→decode→store→replay round-trip coverage for the primitive suite; boundary tests continue to enforce I1, I2, I5, I6.
- No new seams; no UI, transforms, cache, or graph-storage work (deferred to Stages 2–3).

## Capabilities

### New Capabilities
- `evidence-store`: durable, content-addressed evidence persistence (filesystem backend) behind the `EvidenceStore` seam, preserving I1 (hash = id, write-once, immutable) and I9 (provenance path recorded per acquisition).
- `ontology-registry`: runtime registry for registering and validating ontology types (Entity/Relation/Event definitions), keeping core primitives-only and enforcing the open-domain rule.

### Modified Capabilities
<!-- No existing specs change; stage-0 core-schema/engine-runtime deltas are superseded by this deepening and are merged/archived separately. -->

## Impact

- **Code:** new `packages/engine/src/evidence-fs.ts` (filesystem store) + `packages/engine/src/ontology.ts` (registry); seam/types additions in `packages/schema`; tests.
- **Dependencies:** none new for evidence (Node/Bun fs API behind an injectable backend); ontology uses existing `effect` + `Schema`.
- **Config:** evidence store takes a root directory path (validated at the boundary).
- **Process:** TDR-007 decided; graph store (TDR-005), cache (TDR-006), transport (TDR-003) remain deferred behind seams.
