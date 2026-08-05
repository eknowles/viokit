# Design — Stage 2: Source runtime, cache & egress

## Context

See proposal.md — Why. Current state: Stage 0 defined a single `SourceSpec` (`{id, transport, url}`) and a `SourceRuntime.run(spec) => Effect<EvidenceInput, SourceError>` seam (`packages/schema/src/seams.ts:34`), proven with one HTTP transport (`packages/sources/src/http.ts`). The pipeline runs no policy of its own; the engine calls the runtime and writes evidence (`packages/engine/src/engine.ts`). Stage 2 replaces that thin runtime with a policy-owning pipeline while keeping the same seam outward shape so the engine call site barely changes. Decisions already settled: cache backends = L1 in-memory + L2 filesystem, Redis/S3 deferred behind a seam (TDR-006); egress = runtime-owned stage with direct/proxy/disabled and identity binding (TDR-011).

## Goals / Non-Goals

**Goals:**
- A single acquisition pipeline that every transport funnels through: decode spec → retry/backoff → rate-limit → cache read-through → egress → decode/project → `EvidenceInput`.
- Request-fingerprint cache keys that strip credentials; freshness via `mode`/`ttl`/`maxStale`; `cache-only` performs zero egress and returns a typed offline-miss.
- Runtime-owned policy so transforms/UI cannot select transport/cache/egress behavior.
- A second real transport (local file → rows) proving the seam absorbs genuinely different sources (P1 exit proof: HTTP + one dataset source).

**Non-Goals:**
- No Redis / object-store / third-party proxy implementations — only the seams behind which TDR-006/011 defer them.
- No browser transport (TDR-003 remains P3-gated).
- No paid-source quota/cost modeling beyond rate limiting (deferred to a later stage).
- No persisted rate-limit counters across process restarts (in-memory for now).

## Decisions

1. **Pipeline shape: sequential stages over a `SourceContext`, one transport at the end.**
   Retry, rate-limit, cache, egress wrap a single transport call. This keeps the runtime able to host any transport behind the same policy chain (satisfies "source can be anything" end-state) and keeps policy in one place (spec requirement "policy is runtime-owned").

2. **`SourceSpec` expands but keeps `id`/`transport` fields; policy + projection are optional with defaults.**
   Adding `transport: "http" | "dataset"`, `auth`, `retry`, `rateLimit`, `cache`, `egress`, and `projection` (a `Schema` that maps response → `EvidenceInput` payload). Defaults preserve Stage-0 callers (no config = `live-only`, `direct`, no retry). The projection lives in the schema package as a `ResponseProjection` schema so it is serializable and type-checked.

3. **Cache keys are `fnv1aHex` hashes of a canonicalized, auth-stripped request fingerprint.**
   Reuses the existing `fnv1aHex` in `packages/engine/src/hash.ts`. The fingerprint is built from transport identity + non-secret request fields, so two requests differing only in credential collide (spec: "key excludes credentials").

4. **CacheStore seam with L1 in-memory (LRU) + L2 filesystem, selected by config, mirroring the evidence backend pattern.**
   Follows the Stage-1 `EvidenceBackendConfig` selector in `evidence-fs.ts`. `CacheStore` exposes `get(fingerprint)` / `put(fingerprint, entry)` with an `Entry` carrying `{ bytes, contentType, createdAt, expiresAt, maxStaleUntil }`. Freshness checks compute `mode`/`ttl`/`maxStale` at read time. Read-through lives in the pipeline, not the store.

5. **Egress is a runtime stage implementing `direct`/`proxy`/`disabled`.**
   `proxy` takes a proxy id from the spec; the stage records `viaProxy` in the step log and sets `acquisitionPath = "proxy"`. `disabled` short-circuits with a typed error unless the acquisition can be served from cache. `cache-only` never calls egress (spec: "cache-only guarantees offline determinism").

6. **Retry/backoff and rate-limit are effect-scoped stages before egress.**
   Retry uses exponential backoff with jitter over a configured budget (`maxAttempts`, `baseDelay`, `factor`); exhausted → `RetryExhausted`. Rate-limit is a token-bucket per source id held in a `RateLimiter` service (in-memory); violated → `RateLimited`.

## Risks / Trade-offs

- **[Pipeline complexity vs. Stage-0 thinness]** A policy chain is heavier than the current direct call → **Mitigation**: keep stages as small, separately-testable functions; the seam outward shape is unchanged so the engine call site is untouched.
- **[In-memory rate-limit resets on restart]** Counters do not survive restarts → **Mitigation**: accepted for Stage 2; document that persistent rate limiting is deferred, and the token-bucket is behind a `RateLimiter` seam.
- **[Fingerprint collisions]** Hash collisions on request fingerprints could serve wrong cache entries → **Mitigation**: `fnv1aHex` is 64-bit and fingerprints include the transport id; acceptable for Stage-2 scope, revisit with a keyed hash if needed.
- **[File L2 cache growth]** On-disk cache can grow unbounded → **Mitigation**: entries carry expiry; pruning is a later concern behind the `CacheStore` seam.

## Migration Plan

Internal package, no external consumers. `SourceSpec`/`SourceRuntime` change in place; Stage-0 tests and the engine example updated to the expanded spec. No runtime data migration (evidence schema unchanged).

## Open Questions

- Should the dataset transport's projection derive typed rows or just `EvidenceInput` bytes? → defer: default projects to bytes; typed row projections can layer on later without changing the seam.
