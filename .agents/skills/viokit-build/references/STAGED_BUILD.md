# Viokit — Staged Build Strategy

> Companion to `ROADMAP.md`. Agreed 2026-08-04. Principle: the platform is too large to build in
> one pass, so we stage it to (1) **minimize future rework** and (2) **validate the approach early**.
> The ROADMAP remains the *capability deepening* schedule; this document is the *build order* that
> makes each step cheap to redo if wrong.

---

## The two goals and how we serve both

- **Minimal future changes** is decided by three levers, not by how we slice the work:
  1. **Shared Effect Schema as the contract.** One schema package is *the* anti-rework mechanism.
     Server, CLI, API, and UI all validate against it; domain stays in packs; nothing downstream
     breaks the contract.
  2. **Seams over implementations.** Every store/transport (evidence, graph, cache, egress,
     view-state) sits behind a narrow interface. Implement the **simplest backend first**
     (in-memory → filesystem → SQLite); defer heavy backends (Postgres/Neo4j/S3/Redis) behind that
     interface. A later swap is a *backend swap, not an interface change*.
  3. **Defer-only-the-gated decisions.** TDRs split into two buckets: those that **gate the spine
     now** (runtime, evidence-store interface) and those **deferred until the interface is proven**
     (graph store TDR-005, cache TDR-006, transport TDR-003). The single biggest rework risk —
     **graph store** — is deliberately deferred *behind* the seam until Stage 3 proves the
     query/replay interface.
- **Validate as we go.** Every stage ends in a **thin vertical proof** — a real, narrow end-to-end
  thread that demonstrates the architecture before we deepen the layer. No stage adds new seams;
  each stage is a *deepening or a backend swap* against stable contracts.

---

## Stage 0 — The Spine (thin end-to-end proof)

**Goal:** prove the schema and every seam with a single thin thread. Nothing domain-specific, no
heavy backend, no UI.

Build:
- `packages/schema` — shared Effect Schema: primitives (`Entity`, `Relation`, `Event`, `Identifier`,
  temporal/spatial extents, `Evidence`, `Step`, `AcquisitionPath`) plus the capability-boundary
  interfaces (evidence store, graph store, source runtime) as types.
- `packages/engine` — **in-memory** implementations of every seam.
- `packages/sources` — **one real HTTP source** (a simple public API) wired through the runtime so
  `SourceSpec → fetch → Evidence(acquisitionPath) → graph insert` runs for real.

Validations: boundary tests for **I1, I2, I5, I6**; pipeline proof for **I9**.

**Exit:** a single run goes *source → evidence → graph → query → replay* and reproduces state.

**TDRs decided now:** runtime (TDR-001, low risk) + evidence-store **interface**. **Graph store
(TDR-005), cache (TDR-006), transport (TDR-003) stay deferred behind seams.**

---

## Stage 1 — Foundations, deepened (≈ ROADMAP P0)

- Filesystem evidence backend (behind the Stage-0 seam).
- Ontology registry: register/validate types at runtime; primitives-only core.
- Full primitive suite + replay tests.

**Exit proof:** sample entity/relation round-trips through encode→decode→store→replay against the
filesystem backend; I1, I2, I5, I6 enforced by boundary tests.

---

## Stage 2 — Source runtime (≈ ROADMAP P1)

- Full `SourceSpec`: transport, auth, retry/backoff, timeout, rate-limit, key-rotation, cache
  policy, egress policy, response schema → projection.
- `cache`: L1 in-memory + L2 filesystem; modes `live-only` / `cache-first` / `cache-only` / `refresh`;
  ttl / maxStale.
- `egress`: direct / proxy pool / disabled; `cache-only` = offline determinism (**I11**).

**Exit proof:** the HTTP source plus one dataset source run end-to-end; cache hit/miss and
`cache-only` produce correct `acquisitionPath` in evidence (I9); policies enforced (I4/I10/I11).

---

## Stage 3 — Transforms + graph (≈ ROADMAP P2)

- Transform archetypes framework (lookup / search / resolve / geolocate / chronolocate / correlate /
  monitor / extract / archive / analyze); `TransformSpec` input/output schemas; attribution to
  evidence (I2).
- Entity resolution / dedup (correlate) — place and policy TBD by TDR.
- `graph` store deepening: append-only step log + materialized graph + replay + queries (paths,
  timelines, spatial, `relatedness`) — **behind the Stage-0 seam**.
- **TDR-005 (graph store) is decided here**, now that the query/replay interface is proven — the
  backend choice (Postgres vs SurrealDB vs Neo4j) becomes a swap, not a rewrite.

**Exit proof:** an end-to-end mini-investigation (e.g., domain → whois → IP → breach) runs
source → evidence → graph; replay reproduces state (I3); relatedness returns ranked candidates.

---

## Stage 4 — Interfaces + governance + first packs (≈ ROADMAP P3–P4)

- REST/GraphQL API + CLI + MCP server + event stream — all consuming the shared schema.
- Catalog (self-describing) for agents; agent parity (**I8**).
- Web UI: React + Effect client, schema-driven forms/views, results workbench, docking layout,
  view-state persistence (**I12**) — view-state stored apart from the step log.
- Governance: authz, redaction, retention, audit, cache governance.
- Evidentiary export bundle (TDR-010).
- First packs: `corporate-finance`, `people-identity`, `web-dns`, `travel-border` (per
  `PACK_RECIPE.md`).

**Exit proof:** an agent discovers the catalog, runs a transform, and reads the graph through the
same services as the UI (I8); UI shows results across surfaces and restores view state (I12);
governance enforced on a sensitive pack; a defensible evidentiary export.

---

## Sequencing rules

- P0–P2 (Stages 0–3) are the engine core; do not start the UI (Stage 4) until Stage 3 exits.
- Stages 0–3 build **no new seams**; each is a deepening or a backend swap.
- Domain content ships as packs from day one (open-domain rule) — even the Stage-0 proof uses a pack
  shape for any domain-specific sample, never core.
- Anything that adds a store, transport, serialization, or UI dependency requires a `decided` TDR.

## Standing rules (unchanged from ROADMAP/CONTRACT)

TDR gate; invariant checklist (I1–I12) before every commit; `effect-ts` skill for all Effect code;
`AGENTS.md`/ultracite clean; tests per component.

## Definition of done (each stage)

- `npm exec -- ultracite check` clean
- `tsc --noEmit` clean
- tests pass (vitest + @effect/vitest)
- invariant checklist green (CONTRACT.md)
- the stage's thin vertical exit proof runs
- no TDR-gated technology implemented without a `decided` TDR
