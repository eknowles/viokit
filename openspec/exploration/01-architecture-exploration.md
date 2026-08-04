# Viokit — Architecture Exploration

> **Status:** Parking notes. Nothing agreed, nothing is a spec. These are the exploration findings so far,
> saved so we can pick them up later. When we converge, this becomes OpenSpec artifacts
> (`openspec/proposals/...` → `openspec/specs/<capability>/spec.md`).
>
> Name: **Viokit** (viokit.com).

---

## 1. One-line goal

A Maltego-class investigation engine — Effect v4 — that ingests OSINT from many sources, keeps
**immutable evidence** with a **provenance chain**, derives **entities/relations** via **transforms**,
and assembles a **fast, temporal investigation graph** that both humans (web GUI) and **AI agents**
can build and reason over. A key goal is **rapid creation of new sources**, ideally by agents.

---

## 2. Domain model (open-domain framing — see `02-osint-landscape.md`)

The domain is **not closed**. The Bellingcat toolkit alone spans 24 sub-categories / 336 tools
(geospatial, transport, social, corporate & finance, conflict, environment, archiving, media
forensics, ...), and the goal is "and more". We therefore design for an **open domain**:

- **Core = stable primitives + archetypes.** Entity (typed, with identity), typed Identifier,
  temporal extent, spatial extent, Relation, Event, Evidence, Step — plus ~10 transform
  archetypes (lookup, search, resolve, geolocate, chronolocate, correlate, monitor, extract,
  archive, analyze). These are the same in every domain.
- **Domains = pluggable packs.** Each pack contributes entity/relation types, sources, transforms,
  and archetype mappings — registered at runtime, never compiled into core.
- The original corporate+people scope becomes the **first packs** (`corporate-finance`,
  `people-identity`, `web-dns`, plus flagship `travel-border` for the 4D model), not the whole system.

IES is a reference for the *4D idea* (spatiotemporal entities + events), not our substrate.

---

## 3. Architectural spine

```
                    ┌────────────────────────── agents (MCP) ──────────────────────────┐
                    │                            ┌──────────────┐                       │
   sources ──────►  │  Source Runtime             │  catalog /   │                       │
 (spec+handler)     │  transport · backoff ·      │  scaffold    │   plan → graph        │
                    │  retry · timeout · rate     │  guardrails  │                       │
                    │  limit · key rotation       └──────────────┘                       │
                    │        │                                                            │
                    │        ▼                                                           │
                    │  Evidence Capture ──── content-addressed immutable store            │
                    │        │                                                            │
                    │        ▼                                                           │
                    │  Transforms ──── derive entities/relations/events, attribute to     │
                    │        │       evidence, entity resolution/dedup                    │
                    │        ▼                                                           │
                    │  Investigation Graph ── append-only step log → materialized 4D      │
                    │        │       graph (fast reads/writes)                           │
                    │        ▼                                                           │
                    └──  Visualization (web GUI) ─ graph · timeline · map · evidence ───┘
```

The invariant chain: **acquire → capture → derive → assemble**, every hop recorded.

---

## 4. Capability map + invariants (candidate — to be agreed)

| Capability | Owns | Invariant it preserves |
|---|---|---|
| `ontology` | 4D type system: entity/relation/event types, attributes, registry, validation | instances conform to registered types at insert (decode, never trust) |
| `sources` | declarative source specs: transport, auth, backoff/retry/timeout/rate-limit/key-rotation, pagination, **cache policy**, **egress policy** | execution policy is a property of the *source*, enforced by the runtime |
| `evidence` | raw capture, content addressing, provenance, chain of custody, integrity | raw bytes are write-once; every claim traces to ≥1 raw artifact |
| `transforms` | input/output capability matching, execution, fan-out, resolution, attribution | outputs attributed to evidence; cannot fabricate |
| `graph` | 4D graph + append-only step log, replay, queries (paths, timelines, spatial) | replay of the log reproduces the graph |
| `investigations` | cases, branching, export/report | evidentiary trail complete on export |
| `agent-integration` | self-describing catalog, MCP surface, scaffolding, guardrails | agents run same paths as UI — no privileged bypass |
| `visualization` | 4D view: graph + time scrubber + map + evidence panel | renders graph faithfully, time-filtered |
| `cache` | policy-driven response cache: freshness/invalidation, multi-tier, offline mode | cache usage is transparent to the evidence trail |
| `egress` | outbound routing: direct / proxy pool / disabled; identity↔proxy binding | egress policy enforced by the runtime; cache-only is deterministic |
| `governance` | access control, redaction, retention, audit, cache governance | sensitive data never leaks to cache/export without control |
| `deployment` | config, storage backends, topologies (standalone/Compose/K8s), backup/export | same core everywhere; portable evidentiary bundles |

**Candidate invariants**

- **I1 Evidence immutability** — raw artifacts are write-once; content hash *is* identity.
- **I2 Provenance closure** — no vertex/edge enters a graph without a recorded Step referencing ≥1 evidence artifact.
- **I3 Append-only history** — investigations are event logs; replay reproduces state deterministically.
- **I4 Policy isolation** — rate-limit/backoff/retry/timeout/key-rotation live in the source runtime; transforms cannot bypass them.
- **I5 Temporal validity** — `validFrom ≤ validTo`, `observedAt ≤ now`; no future-dated evidence.
- **I6 Schema conformance** — all instances validated against the ontology at the boundary.
- **I7 Source versioning** — outputs cite source+version; replay pins versions.
- **I8 Agent parity** — agents exercise the same runtime paths as the UI.
- **I9 Cache transparency** — every step records its acquisition path (`live`/`cache`/`proxy`) and original acquisition metadata; cache usage never hides provenance.
- **I10 Egress/policy isolation** — cache mode and proxy selection are source/network policy, enforced by the runtime; transforms cannot bypass them.
- **I11 Offline determinism** — in `cache-only` mode, same cache + same inputs ⇒ same graph.
- **I12 View-state persistence** — all user view state (dock layout + every surface's configuration + selection + workbench filters) is Effect-Schema-encoded, versioned, and persists per user + investigation; restorable across sessions and devices. View state is configuration, deliberately excluded from the evidentiary trail (it is not evidence), but its persistence is a hard requirement for *all* views.

---

## 5. Non-functional constraints

- **Fast read AND write.** Ingestion and query must both be fast. Implies:
  - write path: batch-friendly, streaming transforms, minimal sync validation on hot path (validate at boundary, cache results)
  - read path: indexed/materialized graph projections, timeline & path queries optimized, no full-graph scans on common queries
  - storage: content-addressed evidence (filesystem/S3) + a fast graph store; event log for replay/audit
- **Effect v4.** Typed errors, services/layers, retry/schedule built in; Schema for all boundaries and the plugin registry.
- **Evidence integrity** is non-negotiable even under load — hashing is cheap, provenance is structural.
- **Deployability** — one command standalone (SQLite + local content-addressed store + local cache),
  Docker Compose (Postgres + Redis + MinIO + browser pool), or K8s (stateful stores + stateless workers).
  Same core in all topologies.
- **Cache-aware by default** — internet-connected, but policy-driven caching (`live-only`,
  `cache-first`, `cache-only`, `refresh`) with multi-tier storage; cache is transparent evidence.
- **Egress control** — per-source/identity routing (`direct` | `proxyPool` | `disabled`) for org
  proxy needs and fully offline (`cache-only`) operation.

---

## 6. Relationship to IES / "4D"

- We take IES's **extensional four-dimensionalism** as an *idea*: entities and relations have
  spatiotemporal extent; facts are temporally scoped; events are first-class.
- We do **not** adopt the BORO top-level or IES's UK-gov terminology as our substrate.
- Optional future adapter: export investigations as RDF aligned to IES `ies-core`/`ies-top`
  (`SpatioTemporalExtent`, `Event`, `Characteristic`...) — an output adapter, not the core model.
- **Licensing** — IES-org repos are commercially usable: `ies-core` is MIT (code) + OGL v3.0
  (documentation); OGL v3.0 permits commercial and non-commercial exploitation subject to
  attribution ("Contains public sector information licensed under the Open Government Licence
  v3.0"), passing the licence on to redistributors, and no implied official endorsement. The
  licence applies per artifact and per repo (`ont-ies`, `ies-env-building` differ), excludes
  third-party IP/trademarks/personal data, and IES is pre-1.0 (RC, 2026) so terms may change —
  pin the exact commit and re-verify before shipping an adapter. (Not legal advice; recheck with
  counsel before commercial release.)

---

## 7. Open decision forks (blocked on more information)

1. **Ontology substrate** — open registry of pack-contributed types (favored) with optional IES/RDF export. Core ships only primitives + starter shared types.
2. **Data model** — property graph w/ temporal edges (favored) vs RDF. **Read/write speed** pushes toward property graph + indexes.
3. **Storage** — in-memory + serialized for exploration, real store (SurrealDB/Neo4j/Postgres) later. Which store best fits fast read+write + temporal queries is an open question.
4. **Primary interface** — web GUI + MCP/CLI for agents (favored).
5. **Browser session** — a *session/identity abstraction* (cookies, fingerprints, headers) that a real browser (Playwright) can back (favored) vs requiring Playwright everywhere. **The landscape makes this near-mandatory** (most social/map/search sources are browser-first).
6. **Source authoring contract** — spec-only (JSON/YAML interpreted by generic drivers per archetype) for the common 90%, spec+handler for the long tail. Exact split is open.
7. **Domain pack format** — how a pack ships types+sources+transforms (later, once pack #1 exists).
8. **Graph store for shared deployments** — Postgres (JSONB + temporal columns) vs SurrealDB vs Neo4j; SQLite for standalone (see `03`).
9. **Cache scope & sharing** — raw responses + artifacts only vs normalized records too; org-wide shared cache w/ per-project visibility vs per-project caches (see `03`).
10. **Egress identity model** — how identities/sessions bind to proxies and rotate (see `03`).

---

## 8. Parking lot

- `api.key` rotation strategies: round-robin, on-401 rotate, per-key rate budgets.
- Identity/session model: dedicated browser profiles per investigation persona.
- How AI agents compose multi-step investigations and how the graph stores the *plan* vs the *result*.
- Entity resolution / dedup policy (same person across sources, fuzzy name matching) — where it lives in the pipeline.
- **Leaked-data veracity**: how veracity/confidence is modeled on evidence, and how the `correlate` archetype upgrades claims to corroborated. Leak provenance (how/when/from whom) must be recorded.
- **PII & governance**: redaction, access control, retention, and legal/ethical guardrails — a `governance` concern before any leak pack ships. Travel/border data is sensitive (passport numbers, movement).
- Dataset-source ingest: schema mapping (columns → normalized records), raw-file hashing, projection transforms.
- Evidentiary report/export format (what a defensible export contains: claims → steps → evidence → raw bytes).
- Cost control: per-investigation budgets, concurrency caps, cancellation of transform fan-out.
- Whether `messages`/`transactions` are entities or events, and how they anchor temporal queries.

---

## 9. Path to agreement

1. Confirm the open-domain framing + transform archetypes (`02-osint-landscape.md`).
2. Confirm the system architecture + cache/egress/deployment design (`03-system-architecture.md`).
3. Decide the first domain pack(s) — recommendation: `corporate-finance`, `people-identity`, `web-dns`.
4. Decide the storage/data-model fork.
5. Decide the source authoring contract.
6. Then this exploration becomes: proposal → capability specs (with MUST/SHOULD + scenarios) → design decisions.
