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

> **Status: complete (2026-08-05).** The policy-owning acquisition pipeline exited P1: expanded
> `SourceSpec`, cache L1/L2 + modes, egress direct/proxy/disabled, retry + rate-limit stages, and
> both the HTTP and dataset transports run end-to-end behind `SourceRuntime.run` (P1 exit proof).

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

> **Status: interface half complete (2026-08-23).** The self-describing runtime catalog and the
> agent/human front-ends over `Engine` exited under `p3-agent-interfaces` (TDR-016): packs register
> explicitly, transforms run by catalog id, and MCP + CLI are logic-free adapters over one program
> layer. The **web-UI half has not started** and stays gated — TDR-002/003/004/008/009/012 are all
> still `proposed`, and the network API (REST/GraphQL + event stream) waits on TDR-003.

**Goal:** humans and agents drive the same engine.

- ~~Catalog (self-describing) for agents~~ — **done**: sources, transforms, and ontology types, with
  invocation contracts published as JSON Schema (`Schema.toJsonSchemaDocument`).
- ~~CLI + MCP server~~ — **done**: both over the shared operation table in `packages/agent`; parity
  and no-privileged-path are tested (I8).
- REST/GraphQL API + event stream (WebSocket, Arrow IPC for large batches) — **gated on TDR-003**.
- Web UI: React + Effect client, schema-driven forms/views — **first slice done** (`apps/console`:
  catalog, transform launcher with generated forms, evidence submission, graph queries as tables).
  Results workbench (graph/map/timeline, linked selection), docking layout, and view-state
  persistence remain.
- **I12 view-state persistence: met** (TDR-012) — schema-encoded, versioned, per
  (user, investigation, surface), server-backed, and stored apart from the step log. User and
  investigation remain placeholders until governance (P4) and the investigations capability exist.
- **TDRs to decide:** TDR-002 client state/routing, TDR-003 transport (WS+Arrow), TDR-004 docking,
  TDR-008 schema→form, TDR-009 Effect↔Arrow mapping, TDR-012 view-state backend.
- **Exit criteria:** an agent discovers the catalog, runs a transform, and reads the graph through
  the same services as the UI (I8); UI shows results across surfaces and restores view state (I12).

## P4 — Governance + first packs

> **Status: partially met (2026-08-23).** The evidentiary export shipped ahead of the rest
> (TDR-010/TDR-021): a BagIt bundle whose artifact ids *are* their SHA-256 digests, verifiable with
> `shasum` by a recipient who runs none of our software. Governance itself — access control,
> redaction, retention, audit — has not started, and the HTTP surface is still unauthenticated and
> loopback-only because of it.

**Goal:** production hardening and the first real domains.

- `governance`: access control, redaction, retention, audit, cache governance.
- Veracity/confidence model for leaked/unverified data; `correlate` upgrades claims to corroborated.
- ~~Evidentiary export bundle format (TDR-010)~~ — **done**, with TDR-021 making evidence identity
  a cryptographic digest so a bundle attests with the id itself.
- First packs: `corporate-finance`, `people-identity`, `web-dns`, `travel-border` (per PACK_RECIPE).
- **Exit criteria:** governance enforced on a sensitive pack; a defensible evidentiary export
  (claims → steps → evidence → raw bytes); every pack passes the invariant checklist.

---

---

## P5 — Coverage, trust, and the workbench

> Written 2026-08-23, after P3's interface half and P4's export landed. The engine can now acquire
> five ways, build a provenance-complete graph, show it, and export it defensibly. What it cannot do
> is **cover the landscape**, **be used safely by more than one person**, or **update live** — in that
> order of importance.

### Track A — Coverage (recommended first)

The mechanisms for hard-to-reach sources exist and the catalog never caught up. **What the catalog
actually is, established 2026-08-23 from the database rather than from memory:** all 47 candidates are
one bulk import of an awesome-list (`discovered_by = mine:awesome-osint`), `origin` is `NULL` for
every one of them, `notes` is empty for every one, and the 140-unit work queue has been claimed once.
The discovery harness never ran. The descriptions and the `access`/`transport` values were written by
the importing pass; nothing was fetched and nothing was checked.

So the catalog was the one place in this system where an unattributed assertion could enter, and 37 of
them reached shipped pack files where they read as facts. `catalog-evidence-gate` (2026-08-23) closed
it: submission requires an origin, promotion requires a verified classification carrying its evidence,
and every one of the 38 registered sources now reports `accessVerified: false` — which is accurate. A
defensible tool over a catalog of guesses is not yet an OSINT tool.

| Change | Gate | Why now |
|---|---|---|
| `discovery-coverage` | — | Run discovery *at all* — it never has. The 140-unit work queue has been claimed once, and the 47 candidates came from one awesome-list import rather than from the browser-, credential-, and manual-aware sweep the queue was designed for. Submissions now require an origin, so what comes out of this will be traceable in a way the first import was not. |
| `spec-endpoints` | — | **The real remaining work, and now the only route to a verified catalog: promotion requires a classification that concluded something, and a front door always yields `unknown`.** 31 of 38 specs point at a bare host and the other 7 at landing pages: not one addresses an endpoint. Promotion recorded each candidate's homepage and the PACK_RECIPE step of giving a source a real url was never done, so a transform over any of them would acquire a homepage. `catalog_list` now reports `frontDoor` per source, so the work is enumerable. Research per source; nothing else in Track A can conclude without it. |
| `access-reclassification` | blocked on `spec-endpoints` | The mechanism exists — `verify_access` acquires a source through the runtime and reports what it serves, with evidence. The sweep ran on 2026-08-23 and could conclude for almost nothing, because a front door serves a page whatever the source offers. No `access` value was changed: the probe reports and does not apply, which is what stopped a bulk edit that would have marked most of the catalog browser-only. |
| ~~`browser-process-per-route`~~ | TDR-022 | **Done (2026-08-23).** Proxied browser acquisition was refused because proxy binding is a launch switch and processes are reused. Viokit now owns one Chrome per (identity, route) and attaches by DevTools URL; the refusal is lifted and the largest blocked category is open again. |

Track A's remaining work is catalog work rather than engine work — but not the work it looked like.
The mechanisms are all in place; what is missing is not checked classifications but **specs that
address an endpoint at all**.

Two things found while building the mechanisms, both worth knowing before that sweep:

- The HTTP transport had been recording every artifact as `application/octet-stream` and discarding
  response status entirely, so no evidence in the store before 2026-08-23 says what it actually holds,
  and a credential wall was indistinguishable from a successful fetch.
- **Three separate places enumerated evidence fields by hand, and all three silently dropped every
  field added afterwards** — `status` from the access probe, then `acquiredBy`. The filesystem
  evidence backend on read, and the `evidence_get` boundary; the in-memory backend spread its input
  and kept them, so the two backends disagreed and the suite, which uses the in-memory one, never
  noticed. Both decode or spread now, with a test asserting the backends agree. Worth remembering the
  shape: a hand-written field list across a boundary is a silent data-loss bug waiting for the next
  field.
- **Not one of the 38 specs addresses an endpoint.** 31 are bare hosts, 7 are landing or app pages, so
  every source in the catalog serves HTML and nothing about its access can be concluded. Read naively
  the first sweep said 32 of 36 classifications were wrong; it was measuring homepages. The classifier
  now refuses to classify a front door, and the catalog reports which specs are ones.
- **A default deployment could see 9 of the 38 promoted sources.** Eight packs had no manifest and
  `people-identity` had one nothing registered, so 29 sources existed only as files — invisible to the
  catalog, unrunnable, and unverifiable. Fixed by `promoted-sources-are-registered` (2026-08-23), with
  a conformance test so it cannot silently reopen. The verifiable surface is now the whole catalog.

### The unit of work — `investigations`

Proposed and built 2026-08-23, ahead of Track B rather than inside it. Before it, **there was no such
thing as an investigation.** `Step` had no scope, the step log was one unpartitioned table, `replay` folded
all of it, `exportBundle` wrote every artifact on the machine, and view state keyed itself by two
string constants under a comment calling them placeholders.

`CONTRACT.md` had listed `investigations` — cases, branching, export/report — as an owned capability
since the first exploration document, and `exploration/03` defines an investigation as "a
serializable step log + evidence refs ⇒ portable". It had never been built.

| Change | Gate | Why |
|---|---|---|
| ~~`investigations`~~ | TDR-025 | **Done (2026-08-23).** Cases are the unit of work: the step log is scoped, replay and every query answer for one investigation, branches fork at a sequence and inherit their ancestry bounded by each fork, discarding removes no step (I3), and an export is one case. `CONTRACT.md`'s `investigations` capability now exists. |

The build settled three things worth carrying forward:

- **Scope is enforced in one function.** Every query reads the projection `replay` rebuilds, so
  scoping replay scoped everything — export needed no parameter at all. That is the architecture
  TDR-025 bet on, and it paid.
- **A branch is an investigation with a parent.** One type, one lifecycle; fork, discard, open, list,
  and export work on both without special cases.
- **Found by running it, not by a test:** the open investigation only lived in memory, so the CLI
  opened one case and recorded into another. Work landing in the wrong case is the silent failure the
  feature exists to prevent; it is persisted now and pinned.

Track B is unblocked: TDR-023 and TDR-024 now have a unit to apply to.

### Track B — Trust (what turns it into a product)

| Change | Gate | Why |
|---|---|---|
| ~~`identity-and-authz`~~ | TDR-023 | **Done (2026-08-23).** A `Principal` — person or agent — resolved from a bearer credential through a seam; authorization is membership of an investigation. Two principals on one deployment cannot see each other's cases, which is this track's exit criterion. **The loopback rule was a comment**: `VIOKIT_HTTP_HOST=0.0.0.0` published an unauthenticated engine, and nothing refused. It refuses now. |
| `redaction-and-retention` | **TDR-024** (new) | Secrets already stay out of cache and evidence; sensitive *content* does not. Needed before a bundle leaves a machine. |
| `audit-log` | — | Governance's own trail: who ran what, who exported what. |
| `bundle-signing` | unblocked — TDR-023 decided; needs its own TDR for the scheme | An export attests integrity as of export and says nothing about custody before it. **`acquisition-custody` (2026-08-23) put the acquiring principal on the evidence record**, so a bundle now says who obtained each artifact — as an assertion by the exporting deployment, which the manifest states plainly. Signing is what turns that into proof. |
| `veracity-model` | — | Confidence for leaked/unverified data; `correlate` upgrading claims to corroborated (an original P4 item, still unstarted). |

### Track C — The workbench (the rest of P3's visual half)

| Change | Gate | Why |
|---|---|---|
| `map-and-timeline-panes` | — | Selection and time filtering are shared machinery now, so these are cheaper than the canvas was. |
| `live-updates` | **TDR-003**, then **TDR-009** | Streaming graph deltas and step completions. The canvas re-reads on demand today, which is fine until an investigation is long-running. |
| `results-workbench` | **TDR-004** | Triage before results touch the graph; docking layout. |

### Standing debts

- ~~The real `PromoterLayer` write path has no test~~ — **paid (2026-08-23)** by
  `promoted-sources-are-registered`: a `PackRoot` seam replaced the `process.cwd()/packs` guess, which
  was also pointing at the wrong directory, and the write path is covered.
- Merkle-chunking large artifacts, so a big artifact can be partially verified (TDR-021's open
  question).
- I7's second half — replay pinning versions — stays meaningless until replay re-runs sources.

### Exit criteria

- A catalog whose classifications have been verified rather than guessed, with browser- and
  credential-gated sources actually reachable.
- An investigation that two people can work on without seeing each other's credentials or each
  other's redacted material.
- A bundle that says who acquired each artifact, not only that it is intact since export.

---

## Sequencing notes
- P0–P2 are the engine core; do not start P3 (UI) until P2 exits — the UI consumes the engine.
- Packs may begin during P1/P2 for a chosen subject (they prove the recipes), but must be pack-shaped.
- Anything that adds a store, transport, serialization, or UI dependency requires a `decided` TDR.
- P5's tracks are independent: A is about reach, B about trust, C about comfort. Do A before C —
  a better workbench over a thin catalog improves the wrong thing.
