# TDR-019 — Browser transport: `Bun.WebView` vs Playwright vs raw CDP

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** TDR-001 (Bun primary), TDR-011 (egress / identity–proxy model — the gate this clears), TDR-018 (secret provisioning, the sibling half of "sources we cannot reach"); invariants I4/I10, I9, I11; `ROADMAP.md` P1 ("browser transport as a TDR-gated follow-up") and open fork 5 ("Playwright sidecars as a managed service vs in-process browser sessions")

## Decision summary
> Adopt **`Bun.WebView`** (Bun 1.4) with the **Chrome backend** as the browser transport, binding each session to an egress route with `--proxy-server` via `argv` and isolating identities with per-view `dataStore` directories. Bun 1.4 arrives as a **project-local devDependency**, not a system upgrade. The WebKit backend is excluded from egress-bound acquisition because it exposes no proxy control.

## Context
- Browser-only sources are the largest unreachable category: `browser_scrape` in the candidate store, and far more in the wider landscape, where login-walled and manual/web-only tools dominate. `secret-provisioning` cleared the credential half; this clears the transport half.
- TDR-011 (`decided`) settled the identity↔egress binding and explicitly gated the browser transport. What remained undecided was the *automation technology* and its operational shape — `ROADMAP.md` open fork 5.
- Constraints: egress route and cache mode are runtime-owned and cannot be bypassed by a transport (I10); every acquisition records its path (I9); the workspace pins Bun, currently **1.3.13**, and `Bun.WebView` requires **1.4**.
- Affects `packages/sources` (a new transport), `packages/schema` (`Transport` gains a variant), and deployment (a browser must exist on the host).

## Spike evidence

Run against Bun 1.4.0 on macOS with the Chrome backend, using a local HTTP server as both target and proxy. **These results correct the documentation in two places.**

| Question | Result |
|---|---|
| Is `Bun.WebView` present in 1.4? | **Yes**, with `navigate`, `evaluate`, `screenshot`, `click`, `type`, `press`, `scroll`, `goBack`, `reload`, and — undocumented in the guide — **`cdp`** |
| Are Chrome `argv` switches plumbed through? | **Yes** — `--user-agent=VIOKIT-SPIKE` arrived verbatim on the request |
| Does `--proxy-server` route traffic? | **Yes** — Chrome's own background requests (`clients2.google.com`, a `www.google.com:443` CONNECT) arrived at the proxy |
| Does `dataStore: { directory }` isolate sessions? | **Yes** — a cookie set in one view is visible to a second view on the *same* directory and **invisible** to a view on a different one |

Two corrections to the published docs, both load-bearing:

1. The docs state the Chrome `dataStore` maps to `--user-data-dir` and is **"process-wide (shared across views)"**. Measured behaviour is the opposite: directories isolate. Per-identity sessions therefore need no process-per-identity workaround.
2. The docs list no proxy capability and no network interception. In practice `argv` carries `--proxy-server`, and a `cdp` escape hatch exists for interception.

Not established by the spike: a full page navigation *through* a proxy end to end — the probe used a stub that answers HTML rather than implementing proxy semantics, so `ERR_NAME_NOT_RESOLVED` on the navigation is a property of the probe, not evidence against the capability. Proving a complete proxied navigation is the first task of the implementing change.

## Options considered

### Option A — `Bun.WebView` (Bun 1.4), Chrome backend
- **Description:** In-process headless browser from the runtime itself. Sessions bound to egress via `--proxy-server`; identities isolated by `dataStore` directory; `cdp` available where raw protocol access is needed.
- **Pros:** No dependency and no browser download beyond a Chrome that most hosts already have. Aligns with TDR-001 (Bun primary). The spike shows it satisfies both requirements this decision turns on — egress binding (I10) and identity isolation (TDR-011). In-process means no sidecar to supervise, and lifecycle is ordinary resource management.
- **Cons:** Requires Bun 1.4, a major-version move. `unstable`-adjacent surface with sparse and — as measured — partly *wrong* documentation, so behaviour must be pinned by our own tests. Chrome backend only: the macOS-default WebKit backend exposes no proxy control, so a WebKit-backed acquisition would bypass egress entirely and violate I10.

### Option B — Playwright
- **Description:** The established automation library, driven as a sidecar or in-process.
- **Pros:** Mature, documented, and predictable; first-class contexts (`browser.newContext`) for isolation, explicit proxy configuration per context, and real network interception. The largest body of prior art for anti-bot and login flows.
- **Cons:** A heavy dependency plus managed browser binaries, and a sidecar to supervise if run out of process. Its context model is a second lifecycle abstraction beside Effect's scopes. Everything it offers that this decision requires, the spike shows `Bun.WebView` already does.

### Option C — Raw CDP against a browser we launch
- **Description:** Drive Chrome over the DevTools Protocol directly.
- **Pros:** Total control; no automation library.
- **Cons:** We would implement session lifecycle, navigation, and error handling ourselves — which is what both A and B provide. Notably, A does not foreclose this: its `cdp` method is the same escape hatch when a specific interception is needed.

### Option D — Do not build it; rely on manual acquisition
- **Description:** Leave browser-only sources to the `ingest` path shipped in `source-runnability-manual-acquisition`.
- **Pros:** Zero cost; already works; no ToS or anti-bot exposure taken on.
- **Cons:** Manual acquisition does not scale past a handful of artifacts and cannot be scheduled or replayed. It is the right answer for a one-off record and the wrong one for a source consulted repeatedly.

## Evaluation criteria
1. Can a session be bound to a runtime-selected egress route (I10)? — non-negotiable
2. Can identities be isolated per session (TDR-011)?
3. Operational cost: processes to supervise, binaries to manage
4. Dependency weight and fit with TDR-001
5. Maturity, and the cost of being wrong about behaviour

## Analysis
- **Criterion 1 is the gate, and it eliminates the WebKit backend rather than any option.** A transport that cannot be pointed at a proxy silently bypasses the egress stage, which is precisely the crossing `CONTRACT.md` forbids. The spike confirms Chrome-plus-`argv` clears it; WebKit does not, so it is excluded from egress-bound work regardless of which library drives it.
- **Criterion 2 was the expected reason to prefer B**, on the strength of the documented "process-wide" `dataStore`. Measurement reversed that: directories isolate. This is the single finding that changes the decision, and it is why the spike was worth running before writing the TDR rather than after.
- **Criteria 3 and 4 favour A decisively.** No sidecar, no managed browser downloads, no new dependency; the runtime we already pin provides it.
- **Criterion 5 is A's real cost and B's real advantage.** Two of the four things the spike checked contradicted the docs — that is a meaningful signal about how much the published description can be trusted, and the mitigation is that our own tests pin the behaviour we depend on rather than the docs doing it. B's maturity would buy that assurance instead, at the cost of everything in 3 and 4.
- **D is not a competitor but a floor**, and it stays: manual acquisition remains right for one-off artifacts even once this exists.

## Recommendation
- **Option A** — `Bun.WebView`, Chrome backend, in-process.
  - Egress binding: `--proxy-server` via `argv`, supplied by the runtime from the resolved egress decision, never chosen by the transport (I4/I10).
  - Identity isolation: one `dataStore` directory per identity, so sessions and cookies do not cross.
  - **WebKit is excluded** from egress-bound acquisition; if it is ever used, it must be for direct-egress work only, and the transport should refuse to run it under a proxy policy rather than silently ignoring one.
  - `cdp` is the escape hatch for interception, not the default path.
- **Bun 1.4 arrives project-local.** `bun@1.4.0` as a devDependency gives the workspace a 1.4 binary without upgrading the developer's system install — the whole machine should not move for one transport. Migrating the workspace's own runtime to 1.4 is a separate decision with its own verification.
- **What would change this decision:** `Bun.WebView` proving unstable across Bun releases in ways our tests catch repeatedly; a requirement for browser behaviour it does not expose and `cdp` cannot reach; or the WebKit backend gaining proxy control, which would reopen the macOS-native path.

## Open questions
- Whether browser sessions are pooled across acquisitions or created per acquisition. Deferred to the implementing change: it is a performance and resource question, not a capability one.
- How `acquisitionPath` should describe a browser acquisition (I9) — a browser fetch through a proxy is still `proxy`, but the fact that a browser rendered it is worth recording.

## References
- Spike run 2026-08-23 against Bun 1.4.0 / Chrome backend on macOS (results tabulated above)
- TDR-011 (identity↔egress binding; gated this decision); TDR-001 (Bun primary)
- `CONTRACT.md` I10 — transports must not bypass runtime-selected egress
- `ROADMAP.md` open fork 5 — Playwright sidecars vs in-process sessions
