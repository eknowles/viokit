# 03 — System Architecture & Core Design

> **Status:** Parking notes / working design. Companion to `01-architecture-exploration.md` and
> `02-osint-landscape.md`. Nothing is a spec yet.
>
> This document covers the **system design**: component model, request pipeline, cache tier,
> egress/proxy tier, and deployment topologies (standalone / Docker / K8s).

---

## 1. Design goals added at this layer

- **Easy to deploy** — one command standalone, or Docker Compose, or K8s. Same core everywhere.
- **Internet-connected by default, but cache-aware** — a cache tier holds prior search/acquisition
  results; *rules* decide when to serve from cache vs fetch live.
- **Proxy egress** — an organisation can route fetches through proxies (identity/geo/rate reasons)
  or run **cache-only** (no egress) when isolated or rate-limited.
- **Cache as evidence, not a leak** — cached results are *still evidence* with full provenance;
  cache usage is transparent to the evidentiary trail.

---

## 2. Component model (one core, many topologies)

The core is a set of Effect services that compose the same way in every deployment. Thin shells
(CLI, HTTP API, MCP server) bind to the same engine.

```
                    ┌─────────────────────────────  INTERFACE  ─────────────────────────────┐
                    │   CLI        REST / GraphQL API        MCP server        (future Web GUI) │
                    └──────────────────────────────────────────────────────────────────────────┘
                                                       │
                                                    Engine
                          (investigation runner · transform plan executor · fan-out · replay)
                                                       │
        ┌──────────────┬────────────────┬──────────────┼───────────────┬──────────────────┐
        │              │                │              │               │                  │
   SourceRuntime   TransformRunner   GraphStore    EvidenceStore    Governance       EventBus
   (transports,    (archetypes,     (4D graph,     (content-        (authz, redact,   (spans, logs,
    policies)       resolution)      step log)       addressed)       audit)            metrics)
        │                                                              │
        ├── Transport: HTTP ────────┐                                  │
        ├── Transport: Browser ─────┼──►  Egress  (direct | proxy pool | disabled)
        ├── Transport: Dataset ─────┤          │
        └── Transport: Database ────┘          │
                                              ▼
                                        Cache tier
                     (policy-driven read-through · L1 memory · L2 Redis/disk · L3 object store)
                                              │
                                        Internet  (only if egress != disabled)
```

Services:

| Component | Responsibility |
|---|---|
| **Engine** | executes investigation plans, fans out transforms, replays step logs, exposes a query API |
| **SourceRuntime** | owns SourceSpec execution: transport selection, retry/backoff/timeout/rate-limit/key-rotation, **cache policy**, **egress policy** |
| **TransformRunner** | runs transforms by archetype (lookup/search/resolve/geolocate/...), attribution to evidence, entity resolution |
| **GraphStore** | append-only step log + materialized 4D graph; queries (paths, timelines, spatial) |
| **EvidenceStore** | write-once, content-addressed raw artifacts + provenance records |
| **Cache** | read-through response cache, policy-driven freshness, multi-tier |
| **Egress** | outbound network: direct, proxy pool, or disabled (cache-only) |
| **Governance** | access control, redaction, retention, audit — sees every acquisition and query |
| **EventBus / Observability** | Effect spans/tracing, metrics (cache hit rate, throttles, proxy failures), structured logs |

---

## 3. The request pipeline (the heart)

Every acquisition, from any transport, flows through one pipeline — cache and egress are just stages:

```
Transform input
   │
   ▼
SourceRuntime.route()            ← chooses transport + policies for the SourceSpec
   │
   ├─► Cache.lookup(requestFingerprint)
   │       │  policy: live-only | cache-first | cache-only(offline) | refresh
   │       ├─ HIT  → evidence { acquiredFrom: "cache", cachedAt, originFetchRef? }
   │       │          → project → GraphStore.append(step)
   │       └─ MISS → (egress disabled in cache-only mode → fail with OfflineCacheMiss)
   │
   ▼
Egress.send()                    ← direct | proxy-pool | browser-session; retry/backoff/rotate keys
   │
   ▼
Capture raw response             ← immutable, content-addressed (hash = id), redaction policy applied
   │
   ▼
Cache.write()                    ← read-through fill, TTL set, request fingerprint key
   │
   ▼
Normalize + project             ← SourceSpec response schema → entities/relations/events
   │
   ▼
EvidenceStore.record()          ← provenance: acquisitionPath(live|cache|proxy), source+version, timestamps
   │
   ▼
GraphStore.append(step)         ← step references evidence; graph materialized for query/viz
```

Key properties:
- **One pipeline, honest provenance.** Live, cached, and proxied acquisitions all become evidence
  records that *say* how they were acquired. Cache hits are not hidden.
- **Cache and egress are runtime policy, not transform logic** (parallels invariant I4).

---

## 4. Cache tier

### 4.1 What is cached
- **Source responses** (raw bytes) and **fetched artifacts** (pages, images, datasets).
- Normalized records can be cached too; derived graph state is *not* cached (it is rebuilt from the
  step log — replay is the source of truth).
- Cache keys are **request fingerprints**: `sha256(sourceId · sourceVersion · transport · normalizedRequest)`
  with auth material stripped, so one cache can serve many identities/keys. Sensitive values
  (secrets, plaintext passwords) are never cached.

### 4.2 Policies (per source / per endpoint, overridable per investigation)
- **Mode:** `live-only` | `cache-first` | `cache-only` (offline) | `refresh` (bypass + refill)
- **Freshness:** `ttl` (freshness window per endpoint), `maxStale` (how stale a hit may be)
- **Invalidation:** honor `Retry-After` / `ETag` / `Last-Modified`; explicit purge; TTL expiry
- **Budget-aware:** cache-first reduces egress spend; mode can be forced org-wide in `cache-only`

### 4.3 Tiers
| Tier | Backend | Use |
|---|---|---|
| L1 | in-memory (per node) | hot results within a process |
| L2 | Redis / on-disk | shared across workers (Compose/K8s) |
| L3 | object store (S3/MinIO) | durable org-wide cache, cold start |

Standalone defaults to L1 + local-disk L2. Compose/K8s enables shared L2/L3.

### 4.4 Cache as temporal evidence (the 4D angle)
A cache that accumulates over months is effectively **history** — "what did the internet return for
this query on date X". Cached entries are timestamped snapshots, which are exactly the temporal
evidence the 4D model wants. This makes the cache a first-class evidentiary resource, not a
speed hack.

### 4.5 Privacy & governance
- Org-shared cache ⇒ redaction policies apply at **write time**; secrets never enter the cache.
- Cache access is governed (project-scoped visibility of cached results).

---

## 5. Egress / proxy tier

- **Rule per source/session:** `direct` | `proxyPool` | specific proxy | `disabled`.
- **Identity ↔ egress binding:** an identity/session is pinned to a consistent egress path
  (geo-consistent browsing); browser and HTTP transports share the same egress abstraction.
- **Rotation:** on block/429/captcha, rotate proxy (and API key) per policy; failures are recorded.
- **`cache-only` mode:** egress disabled entirely; the runtime fails with a typed
  `OfflineCacheMiss` when the cache lacks a result. Fully deterministic from cache.
- Replaces ad-hoc scraping; every hop is recorded in the step log (`viaProxy: proxyId`).

---

## 6. Deployment topologies

### 6.1 Standalone (single investigator / agent / laptop)
- One process: engine + stores.
- **Graph/steps:** SQLite (embedded). **Evidence:** local content-addressed dir. **Cache:** L1 + disk L2.
- Run: `viokit serve` / `docker run viokit` with a config file + env for secrets.

### 6.2 Docker Compose (team, internet-connected org)
- `engine` + `postgres` (graph + step log) + `redis` (shared cache L2) + `minio` (evidence + cache L3)
  + optional `browser-workers` (Playwright pool).
- Secrets via env/.env; no baked config. `docker compose up`.

### 6.3 Kubernetes (org scale)
- **Stateful:** Postgres (or SurrealDB), Redis, MinIO/S3.
- **Stateless:** engine/workers as Deployments (horizontal scale for ingest + transform fan-out);
  job queue via Postgres/Redis for transform execution.
- **Browser pool** as a separate Deployment (Playwright sidecars).
- Ingress for API/MCP; K8s Secrets for keys; network policies can force `cache-only` on some nodes.
- Horizontal scale targets the *SourceRuntime/TransformRunner* tier, not the stores.

### 6.4 Isolated / cache-only org
- Nodes with no egress; cache pre-populated by a controlled ingestion pipeline; investigations run
  entirely against cache + previously captured evidence. Same code, different policy.

---

## 7. Process & runtime model

### 7.1 One program, one core
The whole system is **one Effect program**: interfaces, engine, domain, policy, and data-plane
*clients* are composed services. Everything above the data plane is **runtime-agnostic** — the same
engine code runs on Bun, Node, or Deno (`@effect/platform-bun` / `@effect/platform-node` swap the
platform bindings only). Topologies differ solely in how the data-plane services are provisioned:
**in-process** (standalone) vs **external** (Compose/K8s).

### 7.2 Standalone — a single process
```
┌─────────────────────────────────────────────── Bun/Node process ───────────────────────────────┐
│  CLI · REST/GraphQL · MCP server · Web GUI shell                                             │
│  Engine · SourceRuntime · Transforms · Cache · Egress · Governance                            │
├───────────────────────────────────────────────────────────────────────────────────────────────┤
│  in-process stores:  SQLite (graph + steps) · content-addressed dir (evidence) · L1+disk L2    │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
        │  egress: direct | proxyPool | disabled (cache-only)
        ▼
    Internet
```
Genuinely one process — `bun viokit` / `docker run viokit`. Default for a lone investigator or a
single agent.

### 7.3 Compose / K8s — a few processes
The *code* stays one engine; the data plane becomes external stateful services and browsers become
a pool:
```
[engine: Bun/Node]  [queue workers]  [browser-pool sidecars: Playwright]
        │                   │                     │
        ▼                   ▼                     ▼
   Postgres · Redis · MinIO (stateful, external)   └─ Playwright browsers (own OS processes)
```
- **Stateful services are products, not our code** — Postgres, Redis, MinIO. They don't care what
  runtime the engine uses.
- **Playwright browsers are separate OS processes regardless of runtime.** The engine talks to the
  browser pool over the session/identity abstraction, so embedding Playwright in-process is optional
  — the core stays single-process even with remote browsers.

### 7.4 Runtime recommendation
- **Default: Bun.** Fast cold start, native TypeScript, excellent HTTP; ideal for iterating on
  sources/transforms and for a first-class CLI. Use the `oven/bun` image in containers.
- **Alternative: Node.** A drop-in for teams that prefer it; nothing in the design depends on the
  choice (Effect's platform layer isolates it).
- Whatever the runtime, browsers, stores, and caches are external in multi-node topologies; the
  process model is identical in shape.

---

## 8. Interfaces

- **CLI** — `viokit run transform --input ...`, `viokit invest <plan>`, `viokit serve`.
- **REST/GraphQL API** — catalog, run transforms, build/query investigations, evidence retrieval.
- **MCP server** — the agent surface (catalog → plan → run → read graph/evidence).
- **Event stream** — graph updates, step completions, cache/proxy events for the web GUI.
- **Web GUI** — React + Effect client, schema-driven forms/views, shared-schema contract (see `04-web-ui.md`).

---

## 9. Observability & operations

- Effect tracing spans on transforms/sources/cache/egress; metrics: cache hit rate, throttle events,
  proxy failures, key rotation, ingest volume; structured logs to stdout/JSON.
- **Backup/export:** an investigation is a serializable step log + evidence refs ⇒ portable
  evidentiary bundle for archive and legal handoff. Whole-cache export/import for air-gapped reuse.

---

## 10. Invariants added/confirmed at this layer

- **I9 Cache transparency** — every step records its acquisition path (`live` | `cache` | `proxy`)
  plus the original acquisition metadata; the evidence chain stays honest whether data came live,
  from cache, or through a proxy.
- **I10 Egress/policy isolation** — cache mode and proxy selection are properties of the source /
  network policy, enforced by the runtime; transforms cannot bypass them.
- **I11 Offline determinism** — in `cache-only` mode the system is deterministic given the cache
  (same inputs + same cache ⇒ same graph).

Existing invariants I1–I8 are unaffected; they concern evidence/provenance/execution, not topology.

---

## 11. Open forks surfaced by this layer

1. **Graph store for shared deployments** — Postgres (JSONB + temporal columns, familiar, robust)
   vs SurrealDB (document+graph, temporal modeling) vs Neo4j. SQLite stays for standalone.
   My lean: Postgres for compose/k8s initially; revisit if temporal queries hurt.
2. **Cache scope** — raw responses + artifacts only, or also normalized records? (I lean: raw +
   artifacts; records are cheap to re-derive.)
3. **Cache sharing boundary** — org-wide shared cache with per-project visibility (governance), vs
   per-project caches. Affects redaction + access control.
4. **Egress identity model** — how identities/sessions bind to proxies and rotate (explore before
   browser transport is built).
5. **Browser pool ops** — Playwright sidecars as a managed service vs in-process browser sessions
   (perf/concurrency trade-off).

---

## 12. Where this lives next

This design will seed capability specs for: `sources` (cache/egress policy contract), `graph`
(replay/serialization), `investigations` (evidentiary bundle export), `governance` (redaction,
access, cache governance), and a new `deployment` concern (config, storage backends, topologies).
