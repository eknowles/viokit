# Source Catalog

> Capability spec for the multi-agent source-discovery harness (`packages/source-catalog`).
> Context: `openspec/changes/source-discovery-harness/{proposal,design}.md`; TDR-013.

## Why

Viokit needs a live, deduped, concurrency-safe catalog of candidate OSINT sources so many agents can discover/classify/document sources in parallel (search → refine → submit) without duplicating work, and so curated candidates can be promoted into real `SourceSpec`s in packs.

## Requirements

### R1 — Work queue with atomic claims and leases
- The harness maintains a queue of `{category, archetype}` work units.
- `claim_work(agent)` atomically returns the next unclaimed unit, marks it `claimed` with `claimedBy` and a `leasedUntil` TTL.
- A unit whose lease expires (crashed agent) is automatically reopened for another agent.
- Two agents claiming simultaneously never both get the same unit.

### R2 — Deduplicated candidate store
- `submit_candidate(candidate)` inserts a new `SourceCandidate` or **merges** into the existing record when the identity fingerprint matches.
- Identity = hash over `(domain, url)`. On merge: union archetypes/notes, append discovery provenance, keep first `url`; never create a duplicate row.
- `domain`/`url` are immutable once set; a correction creates a new fingerprint and **supersedes** the old record (marked `rejected` with a `supersedes` pointer). History is never edited in place.

### R3 — Candidate schema (thin, identity-required)
- Required: `domain`, `category`, `url`, `archetypes`.
- Optional: `access`, `transport`, `description`, `discoveredBy`, `discoveredAt`, `origin`, `notes`.
- Lifecycle `status ∈ {new, claimed, promoted, rejected}`.
- All boundary values decode against the shared schema (I6).

### R4 — Promotion writes a SourceSpec into a pack
- `promote_source(id, spec)` writes an exported `SourceSpec` into `packs/<category>/sources.ts`, marks the candidate `promoted`, stamps `promotion`.
- Idempotent and **promote-once**: a second promotion of the same id fails with `AlreadyPromoted`.
- Promotion is an explicit, type-checked write; it does not touch evidence or history.

### R5 — MCP and CLI front-ends over one service
- MCP tools: `claim_work`, `submit_candidate`, `enrich_candidate`, `list_candidates`, `promote_source`.
- CLI flags map to the same calls. No business logic in either front-end (I8 agent parity).

### R6 — Seeded discovery plan
- Seed work units from the OSINT landscape catalog (categories × archetypes); optionally from the Bellingcat toolkit CSV.
- Uncovered units remain visible in the queue (this is the coverage signal).

## Non-goals
- No harness-owned search/crawl pipeline.
- No runtime execution of promoted sources.
- No shared/fleet backend (SQLite single-file first, behind seams).
- No governance/redaction (candidates are public source metadata).

## Out of scope (elsewhere)
- Full `SourceSpec` acquisition runtime — `source-runtime` capability (Stage 2).
- Runtime catalog for agents running transforms — `agent-integration` (Stage 4).
