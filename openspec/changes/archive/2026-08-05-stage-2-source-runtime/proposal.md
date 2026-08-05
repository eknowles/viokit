# Stage 2 — Source runtime: acquisition pipeline, cache & egress

## Why

Stage 1 proved the `SourceRuntime` seam with a single HTTP source and the filesystem evidence backend. A source can be anything — online services, paid/geo-restricted APIs, networked databases, media stores, drives — but every one must flow through one normalized pipeline: acquire bytes → cache-aware → egress-governed → evidence. Stage 2 makes that pipeline real: full `SourceSpec` (transport, auth, retry/backoff, timeout, rate-limit, key-rotation, cache policy, egress policy, response schema → projection), a multi-tier cache, and an egress/proxy stage — all runtime-owned, per the I4/I10/I11 invariants and the now-`decided` TDR-006 (cache) and TDR-011 (egress).

## What Changes

- **`SourceSpec` schema** grows from `{id, transport, url}` to a full acquisition contract: transport, auth (API key/token), retry/backoff, timeout, rate-limit, key-rotation, cache policy (`mode`, `ttl`, `maxStale`), egress policy (`direct`/`proxy`/`disabled`), and a response-schema → projection mapping.
- **Source pipeline** in `SourceRuntime`: transport selection → retry/backoff → rate-limit → cache lookup (read-through) → egress → response decode/projection → `EvidenceInput`. Every acquisition records `acquisitionPath` (`live`/`cache`/`proxy`) per I9.
- **Cache** (`packages/engine`): a `CacheStore` seam with in-memory L1 + filesystem on-disk L2; request-fingerprint keys (auth-stripped); modes `live-only`/`cache-first`/`cache-only`/`refresh`; `ttl`/`maxStale`. `cache-only` disables egress and fails with typed `OfflineCacheMiss` (I11).
- **Egress** (`packages/engine`): runtime-owned `Egress` stage — per-source `direct`/`proxy`/`disabled`, identity↔egress binding, hop recording (`viaProxy`) in the step log per TDR-011.
- **Dataset source** (`packages/sources`): a second real transport (local file: CSV/JSON → rows) proving the seam absorbs two genuinely different transports, per the P1 exit proof.
- **BREAKING**: the Stage-0 `SourceSpec`/`SourceRuntime` shapes change (schema-only, internal; no external consumers yet).

## Capabilities

### New Capabilities
- `source-runtime`: full acquisition pipeline (transport, auth, retry/backoff, timeout, rate-limit, key-rotation, cache+egress policy, response projection → `EvidenceInput`).
- `cache`: multi-tier read-through response cache (`CacheStore` seam; L1 in-memory + L2 filesystem; modes; freshness; `OfflineCacheMiss`).
- `egress`: runtime-owned egress/proxy stage (policy, identity binding, hop recording, `cache-only` offline determinism).

### Modified Capabilities
- (none — no pre-existing capability spec files; `SourceSpec`/`SourceRuntime` were introduced in Stage 0's spine but have no requirement-level spec yet, so they are covered by the new `source-runtime` capability.)

## Impact

- `packages/schema`: `SourceSpec` expansion, cache/egress policy + response-projection schemas, typed errors (`OfflineCacheMiss`, `RetryExhausted`, `RateLimited`), `viaProxy` hop shape.
- `packages/engine`: new `cache.ts`, `egress.ts` + a rewritten `SourceRuntime` pipeline; new seams (`CacheStore`, `Egress`) behind which Redis/object-store backends and proxy vendors can later swap in.
- `packages/sources`: HTTP transport updated to the new pipeline; new dataset (file) transport.
- Tests: pipeline round-trips, cache hit/miss/refresh, `cache-only` offline determinism, egress policy, dataset projection; invariants I4/I9/I10/I11 enforced.
- Docs: `STAGED_BUILD.md` Stage 2 and `ROADMAP.md` P1 marked complete on exit.
