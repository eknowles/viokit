# TDR-022 — Guaranteeing a browser process per egress route

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** TDR-019 (browser transport — this answers its first open question), TDR-011 (egress / identity–proxy binding), TDR-001 (Bun primary); invariants I4/I10 (runtime-owned egress, no transport bypass), I9 (acquisition path recorded); `ROADMAP.md` P5 Track A (`browser-process-per-route`)

## Decision summary
> Viokit **spawns and owns one Chrome per `(identity, route)`** and attaches `Bun.WebView` to it by DevTools URL, instead of letting Bun spawn Chrome from `argv`. Because all simultaneously-open views in a Bun process share one Chrome connection, browser acquisitions are **serialized across route switches** by a runtime-held permit; concurrency within a single route is allowed. This lifts the blanket refusal of proxied browser acquisition.

## Context

`wire-browser-transport` shipped with proxied browser acquisition **refused outright**. The reason is
in TDR-019's post-implementation finding: `--proxy-server` is a *launch* switch, `Bun.WebView` spawns
Chrome once per Bun process, and every later view reuses that process. An acquisition that runs after
another one silently inherits the first one's route. Traffic leaving by the wrong route while the
evidence records `proxy` is exactly the bypass I10 forbids, so the transport refuses rather than
promises.

That refusal costs the largest unreachable category twice over: `browser_scrape` sources are already
the ones an HTTP transport cannot reach, and the proxied ones among them are precisely the sources
where egress control matters most. Track A cannot re-open them without an answer here.

Constraints:
- The route is chosen by the runtime's egress stage and must not be re-decided, ignored, or degraded
  by a transport (I4/I10).
- Identity isolation stays as TDR-011 requires: one identity's cookies must never be presented under
  another.
- Bun 1.4 / `Bun.WebView`, Chrome backend, per TDR-019. WebKit remains excluded — it exposes no proxy
  control at all.
- Whatever is chosen must be *demonstrable*, not inferred from documentation. Two of TDR-019's four
  spike findings contradicted the published docs, and this decision is a direct consequence of a
  third thing the docs got wrong.

Affects `packages/sources` (the browser transport and its launch decision) and deployment (browser
process count and lifetime).

## Spike evidence

Run 2026-08-23 against Bun 1.4.0 and Chrome 151.0.7922.173 on macOS. The method is falsifiable in a way
TDR-019's was not: a minimal forward proxy over `Bun.listen` answers every absolute-form request with
a page naming *itself*, and the navigation target is `http://proxy-only.invalid/page` — a hostname
that cannot resolve. If the page renders, the proxy was genuinely used; if the proxy was bypassed,
navigation fails. The rendered page therefore names the route actually taken.

| Question | Result |
|---|---|
| Does a second acquisition inherit the first process's route? | **Yes** — launched with proxy B, it rendered proxy **A**'s page; B received zero requests. The hazard reproduces exactly. |
| Does `WebView.closeAll()` release the binding? | **Yes, but only after a settle delay.** With no delay it fails deterministically — `Chrome process closed the pipe`. At ≥50 ms it routed to B correctly in every run. |
| Can `cdp("Target.createBrowserContext", { proxyServer })` set a route per context? | **No.** Chrome answers `Not allowed`: `view.cdp()` is scoped to the page session, and this is a browser-level command. |
| Can Viokit spawn one Chrome per route and attach a view to each by DevTools URL? | **Yes, sequentially.** A → B → A each routed to its own proxy, and both Chrome processes stayed alive across the whole sequence. |
| Does that hold when two views are open at once? | **No.** Two concurrent views pointed at two different Chromes both rendered **A**, while Chrome B sat idle proxying only its own background traffic. |
| Is concurrency safe *within* one route? | **Yes.** Three concurrent views on the same Chrome all rendered correctly. |

**The governing rule these results share:** *all simultaneously-open `Bun.WebView`s in one Bun process
share a single Chrome connection.* The first open view's target wins; the connection is released when
the last view closes. This is the real constraint — "Chrome is spawned once per process" is only its
most visible symptom, and it applies to the documented *connect-by-URL* path just as much as to the
spawn path.

Not established: proxying an **https** target, which needs `CONNECT` and a proxy that really forwards
rather than answering. That is a property of a real proxy, not of the binding, but it is untested and
belongs in the implementing change.

## Options considered

### Option A — Serialize, and `closeAll()` between route changes
- **Description:** Keep letting Bun spawn Chrome from `argv`. Hold a permit around browser
  acquisition; when the required route differs from the live process's, call `WebView.closeAll()`,
  wait for teardown, and let the next acquisition spawn a fresh process.
- **Pros:** Smallest change from what exists — the launch options are already computed in one pure
  function. Uses only documented API. Proven by the spike.
- **Cons:** Every route change is a full Chrome cold start, so an investigation alternating between
  two routes pays it on each switch. Correctness depends on a **timing delay** with no signal to wait
  on — 0 ms fails, 50 ms worked, and nothing about the API says why or promises it stays true.
  `closeAll()` is process-wide: it kills browsers other acquisitions are using, so it is only safe
  under the same permit that makes it slow.

### Option B — Set the proxy per browser context over `cdp`
- **Description:** Use TDR-019's escape hatch: `Target.createBrowserContext({ proxyServer })` per
  route, `Target.createTarget` inside it. One process, many routes, concurrently — Playwright's model.
- **Pros:** Would be the best of every world: no extra processes, no serialization, per-context
  identity isolation for free.
- **Cons:** **Eliminated by evidence.** `view.cdp()` reaches the page session only, and Chrome refuses
  the browser-level command with `Not allowed`. Reaching the browser session would mean opening our
  own DevTools connection alongside Bun's and driving targets by raw CDP — which is Option C's
  process ownership plus TDR-019's already-rejected Option C, and gives up `Bun.WebView` as the driver.

### Option C — Viokit owns one Chrome per `(identity, route)`; views attach by DevTools URL
- **Description:** Spawn Chrome ourselves with `--proxy-server`, `--user-data-dir`, and
  `--remote-debugging-port=0`; read `DevToolsActivePort` from the profile directory; attach with
  `backend: { type: "chrome", url }`. One long-lived process per `(identity, route)` pair, held in a
  scoped pool. A permit serializes acquisitions that would cross routes.
- **Pros:** The binding is guaranteed by construction — the process *is* the route, and it cannot be
  re-decided by anything downstream. Processes stay warm, so a route switch costs a socket attach
  rather than a browser launch; the spike revisited a route with both processes still alive. The
  profile directory becomes a property of the process rather than of the view, which is what
  TDR-011's identity isolation actually wants and removes the last dependence on the per-view
  `dataStore` behaviour the docs describe wrongly. Lifecycle is ordinary Effect resource management.
- **Cons:** We take on process supervision — spawning, readiness (poll for `DevToolsActivePort`),
  reaping idle processes, and surviving a Chrome that dies underneath a pool entry. Process count
  grows as `|identities| × |routes|`. Acquisitions still serialize across route switches, so browser
  throughput is one route at a time regardless of how many processes are warm.

### Option D — One Bun subprocess per route
- **Description:** Since the shared connection is per *Bun* process, give each route its own Bun
  child process driving its own Chrome, and talk to it over IPC.
- **Pros:** The only option that restores **concurrency across routes**, because it removes the
  constraint rather than working within it.
- **Cons:** This is the sidecar shape TDR-019 weighed and rejected on operational cost, arriving by a
  different road — a supervision tree, an IPC protocol, and a second lifecycle abstraction beside
  Effect's scopes, all to buy parallelism nobody has asked for yet. Two Chromes per route (one per
  Bun child, plus the child itself) is also strictly more process than C.

### Option E — Keep refusing proxied browser acquisition
- **Description:** Status quo. Direct-egress browser acquisition works; proxied does not.
- **Pros:** Zero cost, and honest — the refusal is correct behaviour, not a bug.
- **Cons:** Leaves the sources that most need egress control unreachable, and leaves Track A's
  coverage work with a category it cannot open. This is the floor the other options are measured
  against, not a destination.

## Evaluation criteria
1. Is the route **guaranteed**, not merely requested (I4/I10)? — non-negotiable
2. Is identity isolation preserved (TDR-011)?
3. Does correctness rest on measured behaviour rather than timing or documentation?
4. Operational cost: processes supervised, lifetimes managed
5. Throughput: acquisitions per unit time, and what is given up to get it
6. Fit with TDR-019 — does `Bun.WebView` remain the driver?

## Analysis

- **Criterion 1 eliminates B outright and E by definition.** B was the option worth wanting and the
  spike closed it in one command: a page-scoped CDP session cannot create a browser context, and no
  arrangement of `view.cdp()` changes that. A and C both satisfy the criterion, but differently — A
  guarantees the route by ensuring no *other* process exists, C by ensuring the *right* process is the
  one attached. C's guarantee is positive and structural; A's is the absence of a contradiction, which
  is a weaker thing to depend on.
- **Criterion 3 is what separates A from C, and it is decisive.** A's correctness rests on a settle
  delay with nothing to await: `closeAll()` reports nothing, 0 ms fails deterministically, and 50 ms
  happened to work on this machine today. Building an invariant on a sleep is how I10 gets violated
  again in six months, quietly, on a slower host — the failure mode is *wrong route*, not *error*,
  which is the worst kind. C never tears a process down to switch routes, so the race does not exist.
- **Criterion 2 favours C for a reason that goes beyond this decision.** With per-process profiles,
  identity isolation stops depending on the per-view `dataStore` semantics — a behaviour the docs
  describe as process-wide, that TDR-019's spike measured as per-directory, and that we would rather
  not keep betting on. A `(identity, route)` process makes both bindings the same fact.
- **Criterion 4 favours A, honestly.** A supervises nothing; C owns a pool. That is C's real price,
  and it is the ordinary price of owning a resource — spawn, readiness, reap, restart on death — not
  a novel problem.
- **Criterion 5 is a wash between A and C on the axis that matters and favours C on the other.**
  Both serialize across routes, because the shared-connection rule is the same for both. C is faster
  *within* that serialization (attach rather than launch) and additionally permits concurrency inside
  a route, which the spike proved safe. Only D beats them, at a cost criterion 4 will not bear.
- **D is the escape hatch, not the answer.** If browser throughput ever becomes the binding
  constraint, D is where to go, and C is a clean starting point for it — a pool keyed by
  `(identity, route)` is the same abstraction whether the process behind the key is a Chrome or a Bun
  child driving one.

## Recommendation

- **Option C** — Viokit spawns and owns one Chrome per `(identity, route)`; `Bun.WebView` attaches by
  DevTools URL.
  - The pool is scoped: processes are spawned on first use for a pair, kept warm, and killed when the
    scope closes or after an idle timeout.
  - Readiness is the `DevToolsActivePort` file in the profile directory, polled — not a delay.
  - A permit serializes acquisitions across route switches, since the shared-connection rule makes
    concurrent cross-route views silently wrong. Concurrency **within** a route is permitted, and the
    permit must be shaped to allow it rather than degrading to a global mutex.
  - The route still comes from the runtime's egress decision and is never chosen by the transport
    (I4/I10). What changes is that the transport can now **honour** it instead of refusing it.
  - **The blanket proxy refusal is lifted.** The WebKit refusal stays: it has no proxy control, so a
    WebKit backend under a proxy policy must still refuse rather than silently ignore the route.
  - The live test must assert the route was *taken*, by the `.invalid`-host method above — asserting
    that a switch was passed proves nothing, and is how this was missed the first time.

- **What would change this decision:** `Bun.WebView` gaining a per-view browser connection (which
  would remove serialization entirely and might revive B); a Chrome release that makes
  `Target.createBrowserContext` reachable from a page session; or browser throughput becoming the
  binding constraint on an investigation, which is the signal to spend D's cost.

## Post-implementation finding (2026-08-23) — a killed browser leaves its port file behind

Chrome removes `DevToolsActivePort` on a clean exit but **not** when it is killed — which is how the
pool ends every process it owns, and how the process dies when the host exits. Left in place, the
next run's readiness check succeeds immediately against a socket that died with the previous run, and
the acquisition fails with `Chrome WebSocket closed (code 1006)` instead of waiting for the browser it
actually started.

The spawner therefore removes the file before starting a browser, so readiness waits for *this*
process to publish its own port. Caught by the live test on a second run, not the first — worth
recording because the failure only appears after an unclean shutdown, which here is the normal case
rather than the exceptional one.

## Open questions
- **Proxying an https target end to end** — needs `CONNECT` through a proxy that really forwards. The
  binding is not in question; the implementing change should prove the whole path once.
- **Idle-process policy** — how long a warm `(identity, route)` Chrome is kept, and whether the cap is
  on processes or on pairs. A deployment with many rotating identities could otherwise accumulate one
  Chrome per identity.
- **What a browser acquisition records as its `acquisitionPath`** — carried over unanswered from
  TDR-019. A browser fetch through a proxy is still `proxy`, but that a browser rendered it is worth
  recording (I9).
- **Recovering from a Chrome that dies while pooled** — a dead process must not be handed out; whether
  a replacement is transparent or the acquisition fails is a policy question.

## References
- Spike run 2026-08-23 against Bun 1.4.0 / Chrome backend on macOS; six probes tabulated above, using
  a `Bun.listen` forward proxy and a non-resolving `.invalid` target so that a bypassed proxy fails
  rather than silently succeeding
- TDR-019 — browser transport; its post-implementation finding is the problem this decision answers
- TDR-011 — identity↔egress binding
- `CONTRACT.md` I10 — transports must not bypass runtime-selected egress
- `ROADMAP.md` P5 Track A — `browser-process-per-route`
