## Context

See `proposal.md` — Why, and TDR-022 for the measurements. Five facts about the current code shape
this design:

- **`browserLaunchOptions` is already a pure function** returning `launch | refused`, and every rule
  worth testing lives in it. The shape survives; what it returns changes.
- **`BrowserEngine` is a seam** whose only method is `render(options) → html`. Tests drive a fake, and
  a browser starts only for the one opt-in live test. That property must not be lost.
- **`BrowserEngineService` is the deployment's browser capability marker**: `dispatch.ts` treats its
  presence as "this deployment can do browser work", and `TransportCapabilities` reports it. The pool
  must not become a second, separate marker that can disagree with the first.
- **The runtime already supplies identity and route** on `AcquisitionContext` (`identity` from the
  credential reference, `egress` from the egress stage). Nothing new needs to be threaded.
- **`Layer.effect` runs its effect in the layer's scope**, so `Effect.addFinalizer` is enough to
  guarantee spawned processes die with the layer — no separate lifecycle concept.

Constraints: Effect 4.0.0-beta.103; egress stays runtime-owned and un-bypassable (I4/I10); identity
isolation per TDR-011; Bun 1.4 `Bun.WebView`, Chrome backend (TDR-019).

## Goals / Non-Goals

**Goals:**
- A browser acquisition's route is guaranteed by construction, not requested and hoped for.
- The remaining refusals are the ones that are still true, and no broader.
- The suite stays hermetic: no test launches a browser except the opt-in one.

**Non-Goals:**
- Cross-route concurrency. The shared-connection rule makes it impossible in one Bun process, and
  buying it costs a supervision tree (TDR-022 Option D).
- Idle-process reaping on a timer, process caps, or restart-on-death policy. Scope close is the only
  lifecycle event here; the rest are TDR-022's open questions and want a real workload first.
- Anything about `acquisitionPath` recording that a browser rendered the page (TDR-019, still open).

## Decisions

1. **The pure function returns a *route*, not launch switches.**
   `browserLaunchOptions(source, context, config)` now yields `{ route, url }`, where `route` carries
   the pool key, the backend, the argv the process needs, and the profile directory. The switches are
   still derived in one testable place; what changed is that they describe a *process to exist*
   rather than a browser to start now. Alternative considered: having the pool derive its own switches
   from the context (rejected — it would put policy interpretation inside a stateful component, and
   the refusal rules would have nowhere pure to live).

2. **The pool key is `(identity, route)`, and so is the profile directory.**
   Two Chrome processes cannot share a `--user-data-dir` — the second fails on the profile lock — so
   keying the directory by identity alone would break the moment one identity ran under two routes.
   Keying by the pair also has a property worth having on purpose: a session established through a
   proxy is not silently replayed from a direct exit. TDR-011's binding means the pair is usually
   degenerate anyway; where it is not, this is the behaviour to want.

3. **The engine seam takes a DevTools endpoint.**
   `render({ endpoint, url })`. The engine's job shrinks to "attach a view to *that* browser and
   return its HTML", which is the whole reason the route is now guaranteed: an engine that is given an
   endpoint has no way to reach a differently-routed process. The fake engine in tests gets simpler,
   not more complex.

4. **The route gate is a transactional group lock, not a mutex.**
   State is a `TxRef<{ key, count } | undefined>`; entering a route either takes the free gate, joins
   the route already running, or `Effect.txRetry`s until one of those is true. This is a handful of
   lines, race-free by construction, and — unlike a hand-rolled `Ref` + latch — has no window between
   reading the state and acting on it. A plain mutex was the alternative: correct, simpler, and it
   would have thrown away the intra-route concurrency the spike specifically established was safe.

5. **The gate wraps the whole render, not just the attach.**
   The hazard is a view *open* on another route, not the moment of opening one, so the permit must
   span the view's whole life. Releasing after attach would reintroduce exactly the bug.

6. **Readiness is the `DevToolsActivePort` file, polled with a bounded deadline.**
   Chrome writes `<port>\n<path>` into the profile directory once its debugging socket is listening.
   Reading it under a retry is a real signal about a real state; the alternative in TDR-022's Option A
   was a sleep with nothing to wait on, and rejecting that was most of why this design won. The file
   must be *cleared before* spawning: Chrome removes it on a clean exit but not when killed, which is
   how this pool ends every process it owns, so a stale one makes readiness succeed instantly against
   the previous run's dead socket.

7. **The pool lives behind a service with a real default, wired wherever the engine is.**
   `BrowserProcessPoolService` is constructed in the same place that decides a deployment has a
   browser at all, so the capability marker stays single. A deployment cannot end up with an engine
   and no pool.

8. **Refusals narrow rather than disappear.**
   WebKit under a proxy policy still refuses — it has no proxy control at all, and process ownership
   does not give it one. A `proxy` decision with no `viaProxy` still refuses: a route we cannot name
   is a route we cannot bind. What goes away is the blanket refusal of proxied Chrome work.

## Risks / Trade-offs

- **[Browser throughput is now one route at a time]** — a long investigation alternating routes
  serializes → **Mitigation**: warm processes make a switch an attach rather than a launch, and
  same-route work still runs concurrently. If this ever binds, TDR-022 names the escape hatch and this
  design is its starting point.
- **[We supervise processes we did not before]** — a Chrome that dies leaves a dead pool entry →
  **Mitigation**: attaching to a dead endpoint fails the acquisition with a transport error, which is
  the same failure class as any dead transport; a restart policy is deliberately deferred rather than
  guessed at.
- **[Process count grows with identities × routes]** — many rotating identities accumulate Chromes →
  **Mitigation**: scope close kills them all, and the reaping policy is an open question in TDR-022
  rather than an invented number here.
- **[An identity's session no longer follows it across routes]** — a login obtained direct is not
  present under a proxy → **Mitigation**: this is decision 2 working as intended, and the alternative
  is a profile lock failure or a session replayed from an exit it was not established on.
- **[`Bun.WebView`'s connect-by-URL path is as young as the rest of it]** → **Mitigation**: the same
  mitigation TDR-019 chose — our own tests pin the behaviour, and the live test asserts the route was
  taken rather than that a switch was passed.

## Migration Plan

Additive within `packages/sources`; no stored data and no schema change. `SourceSpec`, evidence, and
the catalog are untouched. A deployment that wires no browser engine is unaffected — browser sources
stay reported as blocked, exactly as now. Rollback is restoring the blanket refusal in
`browser-launch.ts`; nothing else depends on the pool.

## Open Questions

Carried by TDR-022 rather than answered here: proving an **https** target end to end through a real
forwarding proxy (`CONNECT`), the idle-process policy, and what happens to a pooled Chrome that dies.
