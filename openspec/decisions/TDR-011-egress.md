# TDR-011 — Egress / identity–proxy model

- **Status:** decided
- **Owner:** core
- **Date:** 2026-08-05
- **Related:** TDR-001 (runtime), TDR-006 (cache backends), ROADMAP P1/P3, STAGED_BUILD.md Stage 2; CONTRACT I4/I10 (egress isolation), I11 (offline determinism)

## Decision summary
> Model egress as a runtime-owned stage with a per-source/session policy of `direct` | `proxyPool` | `proxy` | `disabled`, an **identity ↔ egress binding** (a pinned, geo-consistent path per identity/session), proxy/key rotation on block/429/captcha, and full recording of every hop (`viaProxy`) in the step log. `cache-only` disables egress entirely. Browser and HTTP transports share this single egress abstraction.

## Context
- "A source can be anything" — online APIs, paid services, external systems, network databases, media stores, drives. Many of these are **geo-restricted, rate-limited, or block datacenter IPs**, so a source runtime without egress control (direct/proxy/disabled) cannot reliably reach them. This is the proxy dimension of source breadth.
- Egress and cache are **runtime policy stages**, never transform/UI logic (**I4/I10**): no transform/UI code selects cache mode or proxy; only `SourceRuntime`/policy does.
- **Offline determinism (I11):** in `cache-only` mode egress is disabled entirely and the runtime fails with a typed `OfflineCacheMiss` when the cache lacks a result — replay is deterministic from cache.
- **Identity ↔ egress binding:** an identity/session must be pinned to a consistent egress path (geo-consistent browsing) so services see a coherent identity; this also binds how browser (Playwright) and HTTP transports behave.
- **Honest provenance:** every hop is recorded (`viaProxy: proxyId`, key rotation events) so the evidentiary trail is complete (I9/I12).
- Constraints: Effect v4 + schema-first; secrets (proxy credentials, API keys) live in env/secret store, never in evidence or cache; the model must not couple core to a specific proxy vendor.

## Options considered
### Option A — Runtime-owned egress stage with a single abstraction (recommended path)
- **Description:** An `Egress` service in the runtime owning a per-source policy (`direct` | `proxyPool` | `proxy` | `disabled`), identity→egress binding, rotation on block/429/captcha, and hop recording. HTTP and browser transports call the same `Egress` seam.
- **Pros:** keeps I4/I10 (no bypass from transforms/UI); one abstraction across transports; clean place to enforce geo-consistency and record `viaProxy`; extensible to proxy vendors without touching callers.
- **Cons:** more runtime surface to build in Stage 2; proxy rotation and identity binding are non-trivial policy.

### Option B — Egress as transport configuration only
- **Description:** Proxy choice is just a field on `SourceSpec`/transport; each transport resolves it directly.
- **Pros:** simplest to build.
- **Cons:** duplicates egress logic per transport; invites policy leakage to callers; no single place to enforce geo-consistent identity binding or record hops uniformly; weakens I4/I10.

### Option C — External proxy/capture tool integration
- **Description:** Delegate egress to an external tool/service (e.g., a scraping/proxy SaaS) rather than an internal stage.
- **Pros:** least code; vendor handles rotation/geo.
- **Cons:** couples the core trail to an external service; hop-level provenance (`viaProxy`) is opaque; secrets/identity leave the runtime; conflicts with the self-contained standalone model.

## Evaluation criteria
1. Fit with Effect/schema-first architecture (runtime policy seam)
2. Ecosystem maturity & maintenance
3. Licensing & supply-chain risk
4. Performance / scale behaviour (rotation, geo-consistency, large fan-out)
5. Ops & deployment cost (standalone → K8s)
6. Effort to integrate / learn

## Analysis
- **Fit (1):** Option A is the only one that keeps egress as a runtime-owned policy seam (I4/I10) with a single abstraction shared by HTTP and browser transports, matching the exploration's "identity ↔ egress binding" requirement.
- **Ecosystem (2)/Licensing (3):** A and B are internal (zero new vendor coupling); C imports a third-party dependency and its licensing/supply-chain posture into the core.
- **Scale (4):** A centralizes rotation and geo-consistency, which matters when fanning out many sources; B scatters it; C offloads it at the cost of provenance.
- **Ops (5):** A fits both standalone (direct, or a local proxy pool) and Compose/K8s (a proxy pool service); C adds a vendor subscription.
- **Effort (6):** B is least effort but under-delivers the invariants; A is the right amount and directly validates the egress seam; C is a procurement decision, not a runtime one.

Trade-off made explicit: Option A costs more runtime surface now but is the only option that preserves I4/I10 and the single egress abstraction across transports, and it keeps hop-level provenance inside the trail. The browser-transport case (which most needs identity binding) is gated on this TDR; HTTP/egress policy can proceed immediately.

## Recommendation
- **Chosen:** Option A — a runtime-owned `Egress` stage with per-source policy (`direct` | `proxyPool` | `proxy` | `disabled`), identity↔egress binding, rotation on block/429/captcha, and `viaProxy` hop recording in the step log. HTTP transport uses it in Stage 2; the browser transport is gated on this decision and added later behind the same seam. Secrets never enter evidence/cache (governance).
- **What would change this decision:** a strong requirement to integrate a specific proxy vendor at the core level, or evidence that an internal rotation/identity layer cannot meet geo-consistency needs — in which case a vendor integration becomes a pack/provider behind the `Egress` seam, not a core change.

## Open questions
- (Resolved during Stage 2 implementation) Proxy pool sourcing (local list vs vendor provider) and rotation policy details (backoff on 429, captcha detection).
- **viaProxy recording (decided):** the evidence record's `acquisitionPath` reports the **mode** (`proxy`); the **step log** records the specific hop (`viaProxy: proxyId`). This split keeps I9 (mode is on the evidence) and I12 (full hop provenance lives with the step/trail) without entangling the evidence schema with proxy internals.

## References
- `STAGED_BUILD.md` Stage 2; `ROADMAP.md` P1/P3; `openspec/exploration/03-system-architecture.md` §5 (egress/proxy tier) and §6 (deployment topologies); `openspec/decisions/README.md` TDR-011 row; CONTRACT I4/I9/I10/I11.
