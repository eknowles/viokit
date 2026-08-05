## Why

Viokit is a large, greenfield investigation engine with zero engine code today. To de-risk the biggest
rework driver — the shared schema and the store/source seams — we build a thin **spine** first: one
end-to-end thread (source → evidence → graph → query → replay) against in-memory implementations, all
behind stable Effect-Schema contracts. This validates the architecture before any deep capability work.

## What Changes

- Introduce a `packages/` monorepo structure alongside the existing `viokit-site` workspace.
- Add **`packages/schema`** — the shared Effect Schema contract: primitives (`Entity`, `Relation`,
  `Event`, `Identifier`, temporal/spatial extents, `Evidence`, `Step`, `AcquisitionPath`) plus the
  capability-boundary interface types (evidence store, graph store, source runtime).
- Add **`packages/engine`** — in-memory implementations of every seam and a single orchestrating
  pipeline (source → evidence → graph insert → query → replay).
- Add **`packages/sources`** — one real HTTP source (`SourceSpec` → fetch → `Evidence` with
  `acquisitionPath` → graph insert) wired through the runtime.
- Boundary tests proving invariants **I1, I2, I5, I6** and the pipeline proof for **I9**.
- Decide **TDR-001 (runtime)**: Bun primary, Node drop-in.

This is a **spine, not the full system**. Cache/egress policy, full transports, graph database,
transforms, UI, and domain packs are intentionally **out of scope** here (later stages).

## Capabilities

### New Capabilities
- `core-schema`: the shared Effect Schema primitives and the capability-boundary interface types
  (evidence store, graph store, source runtime). The single contract every interface consumes.
- `engine-runtime`: the in-memory engine — source pipeline, evidence store, graph store, query, and
  replay — that realizes the seams and produces a thin end-to-end proof.

### Modified Capabilities
<!-- None. No existing spec changes in this change. -->

## Impact

- **Code:** new `packages/schema`, `packages/engine`, `packages/sources`; root `package.json`
  workspace entry for `packages/*`.
- **Dependencies:** `effect` + `@effect/*` aligned set (per TDR-001); a dev HTTP source dependency.
- **Docs/contracts:** `STAGED_BUILD.md` Stage 0 realized; `openspec/decisions/TDR-001` decided.
- **Out of scope (later stages):** cache/egress policy, graph DB backend (TDR-005), transports,
  transforms, UI, packs, API/CLI/MCP.
