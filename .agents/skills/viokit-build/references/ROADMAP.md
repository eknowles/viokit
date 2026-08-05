# Viokit — Build Roadmap

> Build phases with gates. Do not start phase N+1 until phase N's **exit criteria** pass. Each phase
> lists the TDRs that must be `decided` before implementation starts. Companion to
> `openspec/exploration/01..04`.

**Standing rules for every phase:** TDR gate; invariant checklist; `effect-ts` skill for all Effect
code; `AGENTS.md`/ultracite clean; tests per component.

---

## P0 — Foundations

> **Status: complete (2026-08-05).** Stage-0 spine plus Stage-1 deepening (filesystem evidence
> backend, ontology registry, primitive + replay round-trip tests) have exited P0.

**Goal:** a type-checked, tested skeleton with the primitives, the ontology registry, the evidence
store, and the shared-schema contract. Nothing domain-specific.

- Toolchain: package + tsconfig + vitest + ultracite (already present); Effect v4 + platform packages
  (effect@beta aligned set); `effect-ts` skill setup (`.repos/effect`).
- Primitives (Effect Schema): `Entity`, `Relation`, `Event`, `Identifier`, temporal + spatial extent,
  `Evidence`, `Step`, `AcquisitionPath` (live/cache/proxy).
- `ontology` registry: register/validate types at runtime; primitives-only core.
- `evidence` store: content-addressed (hash = id), write-once, in-memory + filesystem backend.
- Shared-schema contract module: the boundary between any interface and the engine.
- **Exit criteria:** a sample entity/relation round-trips through encode→decode→store→replay;
  invariants I1, I2, I5, I6 demonstrably enforced by boundary tests.

## P1 — Source runtime (cache + egress)

**Goal:** one acquisition pipeline with policy-driven caching and egress.

- `SourceSpec` schema: transport, auth, backoff/retry/timeout/rate-limit/key-rotation, cache policy,
  egress policy, response schema → projection.
- Transports: **HTTP** first, then **dataset** (files: schema mapping), then **browser** (session/
  identity abstraction) as a TDR-gated follow-up.
- `cache`: request-fingerprint keys (auth-stripped), modes (`live-only`/`cache-first`/`cache-only`/
  `refresh`), ttl/maxStale, L1 + disk L2.
- `egress`: direct / proxy pool / disabled; `cache-only` = offline determinism (I11).
- **TDRs to decide:** TDR-006 cache backends, TDR-007 evidence store, TDR-001 runtime, TDR-011 egress
  identity model (before browser transport).
- **Exit criteria:** an example HTTP source and a dataset source run end-to-end; cache hit/miss and
  cache-only mode produce correct `acquisitionPath` in evidence (I9); policies enforced (I4/I10).

## P2 — Transforms + graph

**Goal:** transforms derive entities/relations from evidence; investigations assemble a replayable 4D graph.

- Transform archetypes framework (lookup/search/resolve/geolocate/chronolocate/correlate/monitor/
  extract/archive/analyze); `TransformSpec` input/output schemas; attribution to evidence (I2).
- Entity resolution / dedup (correlate) — place and policy TBD by TDR.
- `graph` store: append-only step log + materialized graph; replay; queries (paths, timelines,
  spatial, `relatedness` ranking).
- **TDRs to decide:** TDR-005 graph store (Postgres vs SurrealDB vs Neo4j).
- **Exit criteria:** end-to-end mini-investigation (e.g., a domain → whois → IP → breach) runs
  source → evidence → graph; replay reproduces state (I3); relatedness returns ranked candidates.

## P3 — Interfaces + web UI

**Goal:** humans and agents drive the same engine.

- REST/GraphQL API + CLI + MCP server + event stream (WebSocket, Arrow IPC for large batches).
- Catalog (self-describing) for agents.
- Web UI: React + Effect client, schema-driven forms/views, results workbench (table/graph/map/
  timeline, linked selection), docking layout, view-state persistence (I12).
- **TDRs to decide:** TDR-002 client state/routing, TDR-003 transport (WS+Arrow), TDR-004 docking,
  TDR-008 schema→form, TDR-009 Effect↔Arrow mapping, TDR-012 view-state backend.
- **Exit criteria:** an agent discovers the catalog, runs a transform, and reads the graph through
  the same services as the UI (I8); UI shows results across surfaces and restores view state (I12).

## P4 — Governance + first packs

**Goal:** production hardening and the first real domains.

- `governance`: access control, redaction, retention, audit, cache governance.
- Veracity/confidence model for leaked/unverified data; `correlate` upgrades claims to corroborated.
- Evidentiary export bundle format (TDR-010).
- First packs: `corporate-finance`, `people-identity`, `web-dns`, `travel-border` (per PACK_RECIPE).
- **Exit criteria:** governance enforced on a sensitive pack; a defensible evidentiary export
  (claims → steps → evidence → raw bytes); every pack passes the invariant checklist.

---

## Sequencing notes
- P0–P2 are the engine core; do not start P3 (UI) until P2 exits — the UI consumes the engine.
- Packs may begin during P1/P2 for a chosen subject (they prove the recipes), but must be pack-shaped.
- Anything that adds a store, transport, serialization, or UI dependency requires a `decided` TDR.
