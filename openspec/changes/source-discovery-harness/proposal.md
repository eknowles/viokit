# Source Discovery Harness — multi-agent source catalog

## Why

Viokit needs sources from OSINT tools, open datasets, and APIs — but the domain is open by nature (24 sub-categories in the Bellingcat toolkit and "and more"). Exploration `02-osint-landscape.md` §5 calls for the taxonomy to become a *live, queryable source index* rather than a static doc. Today there is no place where candidate sources are discovered, deduped, and curated into the `SourceSpec` definitions that Stage 2's runtime consumes.

The problem is **coverage at speed**: to surface many sources quickly, we want many agents scanning in parallel (search → refine → submit) without duplicating each other's work. This requires a shared, concurrency-safe catalog with **claims** (so agents don't scan the same slice) and **dedup** (so identical submissions collapse).

## What Changes

- **`packages/source-catalog`** — a new dev/curation-time package (the harness) with one Effect service and two thin front-ends (MCP server + CLI):
  - **`WorkQueue`** — partitionable, claimable units of work (`{category, archetype}`) with atomic claims and TTL leases so crashed agents don't block the pool.
  - **`CandidateStore`** — deduped, durable `SourceCandidate` records; content-hash identity (`domain`+`url`); merges on duplicate; immutable history with a supersede path.
  - **`Promoter`** — writes a promoted `SourceSpec` directly into `packs/<name>/sources.ts`.
- **`SourceCandidate` schema** — a lightweight record (name, category, url, archetypes, access, transport, description, provenance, lifecycle status). Everything but identity is optional so agents submit fast and enrich later.
- **MCP tools** — `claim_work`, `submit_candidate`, `enrich_candidate`, `list_candidates`, `promote_source` (plus CLI equivalents). Search itself stays on the agent side.
- **TDR-013** — SQLite-backed store (atomic claims + dedup), decided before implementation.

## Capabilities

### New Capabilities
- `source-catalog`: the source-discovery harness — `WorkQueue` (claim/lease), `CandidateStore` (dedup/merge/supersede), `Promoter` (candidate → `SourceSpec` in a pack), MCP + CLI front-ends.

### Modified Capabilities
- `agent-integration`: gains the source-catalog MCP tools as an agent-facing surface (agent parity, I8).
- `schema`: adds the `SourceCandidate` record (and related lifecycle types) to the shared schema.

## Impact

- `packages/schema`: `SourceCandidate` + status/lifecycle types; typed errors (`ClaimConflict`, `DuplicateSubmit` handled by merge, `AlreadyPromoted`).
- `packages/source-catalog` (new): `work-queue.ts`, `candidate-store.ts`, `promoter.ts`, `store` (SQLite behind seams), `mcp.ts`, `cli.ts`, `seed.ts` (seed work units from the OSINT catalog + optional Bellingcat CSV).
- `packages/sources`: promoted `SourceSpec`s land in `packs/*/sources.ts` (via `Promoter`); no runtime behavior change.
- Tests: claim atomicity + lease expiry, dedup merge across agents, supersede immutability, promote-once, MCP tool round-trips; invariants I6 (boundary decode), I8 (agent parity), I9 (provenance of discovery).
- Docs: `STAGED_BUILD.md` / `ROADMAP.md` noted as a Stage-2 companion; the source index becomes the live catalog it called for.
