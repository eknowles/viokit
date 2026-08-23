# Design — Source Discovery Harness

## Context

See `proposal.md`. Current state: Stage 1 completed the engine, evidence-fs, ontology registry, and a thin HTTP `SourceRuntime` seam (`packages/sources/src/http.ts`, `packages/schema/src/seams.ts`). Stage 2 (in flight) is expanding `SourceSpec` into a full acquisition pipeline. There is currently no place to *discover and curate* the sources those specs describe — the OSINT landscape (`02-osint-landscape.md`) is a static doc and a static CSV. This change builds the harness that turns that landscape into a live, deduped, concurrency-safe catalog agents can feed, and that promotes curated candidates into real `SourceSpec`s in packs.

The hard requirement is **multi-agent coverage at speed**: N agents in parallel, each doing search → refine → submit, without duplicating work. That drives two non-negotiable store behaviors — **atomic claims** (agents don't scan the same slice) and **content-hash dedup** (identical submissions collapse) — which is why the store choice is TDR-gated (TDR-013, lean SQLite).

Decisions already settled with the user:
- Output artifact is a **lightweight candidate record** (option B) promoted later, not a full `SourceSpec` up front.
- Store model is **shared store with claims/locking** (option A).
- Search stays **on the agent side** (option A); the harness orchestrates coverage via a claimable work queue.
- Interface is **MCP server** (agents) + **CLI** (humans/scripts) over one Effect service.
- Promotion **writes directly into `packs/<name>/sources.ts`** (option A).
- Claims are **lease-based** (TTL auto-release).

## Goals / Non-Goals

**Goals:**
- A single Effect service (`packages/source-catalog`) that both MCP and CLI wrap, so agents and humans exercise identical paths (I8).
- `WorkQueue`: claimable `{category, archetype}` units; atomic claims; TTL leases so a crashed agent releases its unit.
- `CandidateStore`: durable, deduped candidates; content-hash identity over `(domain, url)`; merge on duplicate; immutable history with a supersede path (I3-consistent); provenance of discovery recorded (I9).
- `Promoter`: `promote_source(id, spec)` writes a `SourceSpec` into `packs/<name>/sources.ts`, idempotent and promote-once.
- Seed the work queue from the OSINT landscape catalog (categories × archetypes), optionally from the Bellingcat toolkit CSV.

**Non-Goals:**
- No harness-owned search/crawl pipeline (agents bring their own search).
- No runtime execution of promoted sources (the `sources` capability owns that, Stage 2).
- No shared/fleet backend (SQLite single-file first, behind seams).
- No persistence of agent "sessions" beyond claim leases.
- No governance/redaction (candidates are public source metadata, not evidence).

## Decisions

1. **`SourceCandidate` is a thin record; only identity is required.**
   Required: `domain`, `category`, `url`, `archetypes`. Everything else optional (`access`, `transport`, `description`, `notes`, `discoveredBy/At`, `origin`). Fast to submit; enrichable later via `enrich_candidate`. Dedup key = hash over `(domain, url)`. `domain`/`url` immutable once set; corrections create a new fingerprint and supersede the old record.

2. **Lifecycle is explicit and immutable-forward.** `status ∈ {new, claimed, promoted, rejected}`. `promote_source` is promote-once and idempotent (`AlreadyPromoted` on a second promotion of the same id). A superseded record is marked `rejected` with a `supersedes` pointer; history is never edited in place.

3. **`WorkQueue` uses atomic compare-and-set with TTL leases.** `claim_work(agent)` atomically takes the next `open` unit and sets `status=claimed, claimedBy=agent, leasedUntil=now+TTL`. `release_work(id)` returns it to `open`. A background/on-demand pass reopens units whose lease expired (crashed agents). Two agents claiming the same unit → one wins, the other gets the next open unit.

4. **`CandidateStore` dedups by content hash.** On submit, compute `fnv1aHex(domain, url)` (reuse the hash in `packages/engine/src/hash.ts`). New fingerprint → insert. Existing → **merge** (union archetypes/notes, append `discoveredBy/At` provenance, keep first `url`), never a duplicate row. Store is SQLite behind a `CandidateStore` seam per TDR-013.

5. **Promotion writes a real `SourceSpec` into the pack file.** `promote_source(id, spec)` appends an exported `SourceSpec` to `packs/<category>/sources.ts` (creating the file/scaffold if needed), sets `status=promoted`, stamps `promotion`. The candidate `category` is the **pack slug** (e.g. `web-dns`, matching `packs/web-dns/`); the catalog seeds these slugs from the landscape catalog, so display names are mapped to slugs at seed time. Because candidates are thin, promotion is the moment full transport/auth/policy/cache/egress decisions are authored — that is a deliberate human-or-agent-authored act, not derived automatically.

6. **Front-ends are thin over one service.** `McpSourceCatalog` exposes `claim_work`, `submit_candidate`, `enrich_candidate`, `list_candidates`, `promote_source`; `cli.ts` maps the same calls to flags. No business logic in either front-end (I8).

## Risks / Trade-offs

- **[SQLite vs filesystem for concurrency]** A DB file is heavier than plain files, but atomic claims/dedup across N live agents is exactly where a filesystem is weakest → **Mitigation**: TDR-013 weighs this; SQLite chosen; in-memory kept as the test seam.
- **[Search is unobservable]** The harness doesn't own search, so it can't see coverage gaps directly → **Mitigation**: the seeded work queue *is* the coverage plan; agents claim units, so uncovered units remain visible in the queue.
- **[Promotion is a code write]** Writing into `packs/*/sources.ts` mutates source files → **Mitigation**: promote-once, idempotent, writes a valid exported `SourceSpec` (type-checked), and is a deliberate explicit action; it does not touch evidence/history.
- **[Duplicate/merge correctness]** Two agents racing the same hash → **Mitigation**: a unique index on the fingerprint means SQLite serializes the insert; the loser performs a merge read, never a partial write.
- **[Orphaned claims]** A crashed agent holds a unit forever → **Mitigation**: lease TTL + reopen pass.

## Migration Plan

New internal package; no existing consumers change. The shared `SourceCandidate` schema is additive to `packages/schema`. Promoted specs are added to packs; existing pack structure is unchanged. No runtime data migration.

## Open Questions

- (Resolved during implementation) Exact SQLite table layout and claim/lease SQL.
- (Resolved during implementation) Whether to ship the optional Bellingcat-CSV seed now or defer to a seed-only `category × archetype` grid.
