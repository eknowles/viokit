# Tasks — Stage 2: Source runtime, cache & egress

## 1. Schema: expanded SourceSpec + typed errors

- [x] 1.1 Expand `SourceSpec` in `packages/schema/src/schemas.ts`: add `transport` union (`"http" | "dataset"`), `auth`, `retry`, `rateLimit`, `cache`, `egress` policy, and `projection` fields with defaults preserving Stage-0 callers.
- [x] 1.2 Add schemas for `RetryPolicy`, `RateLimitPolicy`, `CachePolicy` (`mode: "live-only" | "cache-first" | "cache-only" | "refresh"`, `ttl`, `maxStale`), `EgressPolicy` (`direct | proxy | disabled` + proxy id), and `ResponseProjection`.
- [x] 1.3 Add typed errors `RetryExhausted`, `RateLimited`, `OfflineCacheMiss`, `EgressDisabled` (TaggedError classes) alongside `SourceError`.
- [x] 1.4 Update `SourceRuntime.run` in `seams.ts` if its signature changes (keep `Effect<EvidenceInput, SourceError>)` outward shape) and re-export new types.

## 2. Cache layer

- [x] 2.1 Define `CacheStore` seam in `packages/engine/src/cache.ts`: `get(fingerprint)` / `put(fingerprint, entry)` with `CacheEntry` (`bytes`, `contentType`, `createdAt`, `expiresAt`, `maxStaleUntil`).
- [x] 2.2 Implement in-memory L1 (`Map` + simple LRU) behind `CacheStore`.
- [x] 2.3 Implement filesystem L2 behind the same `CacheStore` seam (content-addressed files under a cache root), reusing the fs-io pattern from `evidence-fs.ts`.
- [x] 2.4 Add `CacheBackendConfig` selector (`"memory" | "filesystem"`) mirroring the evidence backend pattern; add `CacheLayer` factory.
- [x] 2.5 Implement request-fingerprint key derivation (canonical, auth-stripped) using `fnv1aHex` from `hash.ts`.
- [x] 2.6 Implement cache-mode freshness read logic (`live-only`/`cache-first`/`cache-only`/`refresh`, `ttl`, `maxStale`).

## 3. Egress layer

- [x] 3.1 Define `Egress` seam in `packages/engine/src/egress.ts` with per-source policy resolution (`direct`/`proxy`/`disabled`).
- [x] 3.2 Implement `direct` (unproxied) and `disabled` (typed `EgressDisabled` / offline short-circuit) paths.
- [x] 3.3 Implement `proxy` path recording `viaProxy` in the step log and setting `acquisitionPath = "proxy"`; `direct` sets `acquisitionPath = "live"`.
- [x] 3.4 Wire identity↔egress binding so an identity's credential always uses its bound egress path.

## 4. Runtime pipeline

- [x] 4.1 Add retry/backoff stage (exponential + jitter over `maxAttempts`/`baseDelay`/`factor`; exhausted → `RetryExhausted`).
- [x] 4.2 Add token-bucket rate-limit stage per source id (`RateLimiter` service; violated → `RateLimited`).
- [x] 4.3 Compose the full `SourceRuntime.run` pipeline: decode spec → retry → rate-limit → cache read-through → egress → decode/project → `EvidenceInput` with `acquisitionPath`.
- [x] 4.4 Ensure `cache-only` performs no egress and returns `OfflineCacheMiss` on miss; `live-only` never reads cache.
- [x] 4.5 Update `packages/sources/src/http.ts` to the new `transport: "http"` pipeline; keep the HTTP bytes producer behind its seam.

## 5. Dataset source + exit proof

- [x] 5.1 Implement `dataset` transport (`packages/sources`) reading a local file (CSV/JSON) and projecting rows to `EvidenceInput` (default: raw bytes).
- [x] 5.2 Run the P1 exit proof: HTTP source and dataset source both execute end-to-end via `SourceRuntime.run` into `EvidenceInput`.

## 6. Tests & docs

- [x] 6.1 Schema tests: `SourceSpec` decode with defaults; typed errors; projection schema.
- [x] 6.2 Cache tests: L1/L2 hit, miss, `refresh` overwrite, stale-within-maxStale, `cache-only` offline miss, key-strips-credentials.
- [x] 6.3 Egress tests: direct/proxy/disabled; `viaProxy` in step log; `cache-only` no egress.
- [x] 6.4 Pipeline tests: retry success/exhausted, rate-limit, full HTTP + dataset runs produce correct `acquisitionPath`.
- [x] 6.5 Update engine example (`example/spine.ts`) to the expanded spec; keep `tsc --noEmit`, `ultracite check`, and existing suites green.
- [x] 6.6 Mark `STAGED_BUILD.md` Stage 2 and `ROADMAP.md` P1 complete on exit proof; `openspec validate` passes.
