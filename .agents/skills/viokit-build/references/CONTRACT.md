# Viokit Contract — Invariants & Boundaries

> Single authoritative source for the Viokit guardrails. Explored in
> `openspec/exploration/01-architecture-exploration.md`; this is the distilled, checkable form.
> Status: candidate — to be agreed. The skill enforces it now; agreement updates it.

---

## Invariants I1–I12

Each invariant has a **verification hint** — how to check a change does not break it.

| # | Invariant | Verification hint |
|---|---|---|
| I1 | **Evidence immutability** — raw artifacts are write-once; content hash *is* identity | no code path mutates a stored artifact; hash computed at write; change = new artifact + supersede ref |
| I2 | **Provenance closure** — no vertex/edge enters a graph without a recorded Step referencing ≥1 evidence artifact | graph insert API requires a Step ref with ≥1 evidence id; bare inserts rejected at the boundary |
| I3 | **Append-only history** — investigations are event logs; replay reproduces state deterministically | the log is append-only; graph state is a fold over the log; no in-place mutation of history |
| I4 | **Policy isolation** — rate-limit/backoff/retry/timeout/key-rotation/cache/egress live in SourceRuntime | transforms/UI never hold raw fetch/clients; they get the runtime API only; no network I/O in transform code |
| I5 | **Temporal validity** — `validFrom ≤ validTo`, `observedAt ≤ now`; no future-dated evidence | boundary schema validation rejects invalid extents; no system clock skew accepted |
| I6 | **Schema conformance** — all instances validated against the ontology at the boundary | decode at every boundary (never trust); the same Effect Schema is shared server/client |
| I7 | **Source versioning** — outputs cite source+version; replay pins versions | every Step *derived from an acquisition* records sourceId+version (a correlate-derived step has no source and records none — an invented provenance is worse than an absent one). **Replay pinning is not yet meaningful**: replay folds the log and re-runs nothing, so there are no versions to resolve. Revisit when replay gains re-execution. |
| I8 | **Agent parity** — agents exercise the same runtime paths as the UI | MCP tools call the same Engine/TransformRunner services; no privileged bypass exists |
| I9 | **Cache transparency** — every step records acquisition path (`live`/`cache`/`proxy`) + original acquisition metadata | evidence record always has `acquisitionPath`; cache hits record origin fetch ref |
| I10 | **Egress/policy isolation** — cache mode and proxy selection are source/network policy, enforced by runtime | no transform/UI code selects cache mode or proxy; only SourceRuntime/policy does |
| I11 | **Offline determinism** — in `cache-only` mode, same cache + same inputs ⇒ same graph | cache-only disables egress; typed `OfflineCacheMiss`; replay is deterministic |
| I12 | **View-state persistence** — all view state (all surfaces) is schema-encoded, versioned, per (user, investigation), server-backed | every surface serializes its state; schema has a version; stored apart from the step log |

---

## Capability map & ownership

| Capability | Owns | Must not |
|---|---|---|
| `ontology` | 4D type registry, primitives, validation | hold domain types in core |
| `sources` | SourceSpec, transports, policies (retry/backoff/timeout/rate-limit/key-rotation/cache/egress) | leak policy decisions to callers |
| `evidence` | raw capture, content addressing, provenance, custody | allow mutation |
| `transforms` | archetypes, execution, resolution, attribution | bypass SourceRuntime (I4); fabricate (I2) |
| `graph` | step log, materialized 4D graph, queries, `relatedness` | mutate history in place |
| `investigations` | cases, branching, evidentiary export | omit the trail on export |
| `agent-integration` | catalog, MCP, scaffolding, guardrails | privileged paths (I8) |
| `cache` | freshness/invalidation, tiers, offline mode | hide usage from the trail (I9) |
| `egress` | routing direct/proxy/disabled, identity↔proxy | bypass by transforms/UI (I10) |
| `governance` | authz, redaction, retention, audit, cache governance | leak sensitive data to cache/export |
| `visualization` | schema-driven surfaces, workbench, view-state | write view state into evidence/history |
| `deployment` | config, storage backends, topologies, backup/export | topology-specific logic in core |

## Forbidden crossings
- Core contains domain entity/relation types (open-domain rule).
- Transforms or UI perform raw network I/O or select cache/proxy themselves (I4/I10).
- A vertex/edge enters the graph without Step→evidence (I2).
- Agents mutate graph/history through non-Engine paths (I8/I3).
- Secrets (incl. plaintext passwords) enter the cache or evidence by default (governance).
- View state is written to the step log (I12).
- Technology is implemented without a `decided` TDR (see `openspec/decisions/`).

---

## Checklist (run before commit)
- [ ] No invariant violated (walk I1–I12 above).
- [ ] All technology choices referenced have `decided` TDRs.
- [ ] New domain content is in a pack, not core.
- [ ] `ultracite check`, `tsc --noEmit`, tests all green.
