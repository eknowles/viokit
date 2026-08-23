# Tasks — Browser Process per Egress Route

> Prereq: TDR-022 `decided`. Requires a Chrome-family browser and Bun 1.4 to run the opt-in live test.

## 1. Route derivation

- [x] 1.1 `browserLaunchOptions` returns `{ route, url }`, where the route carries key, backend, argv, and profile directory.
- [x] 1.2 A proxied route adds the proxy switch; a direct route adds none.
- [x] 1.3 The pool key and the profile directory are both keyed by `(identity, route)`.
- [x] 1.4 WebKit under a proxy policy stays a typed refusal; a proxy route naming no proxy stays a typed refusal.
- [x] 1.5 Tests for each rule, with no browser launched.

## 2. The process pool

- [x] 2.1 A `BrowserProcessPool` seam: an endpoint for a route, spawning on first use.
- [x] 2.2 The implementation: spawn Chrome with proxy, profile, and remote-debugging switches; clear the stale port file a killed browser leaves behind; retry the readiness read under a bounded deadline; kill every process when the layer's scope closes.
- [x] 2.3 Test against a fake spawner: one process per route, reused on revisit, distinct across routes and identities.
- [x] 2.4 Test: a browser that never becomes ready fails the acquisition rather than hanging.

## 3. The route gate

- [x] 3.1 A transactional group lock over `(route key, count)`.
- [x] 3.2 Test: two acquisitions on different routes do not overlap.
- [x] 3.3 Test: two acquisitions on the same route do overlap.
- [x] 3.4 Test: the gate is released on failure and on interruption, so one refusal does not wedge it.

## 4. Transport

- [x] 4.1 The engine seam takes a DevTools endpoint and a url.
- [x] 4.2 `Bun.WebView` attaches to the endpoint rather than spawning.
- [x] 4.3 The transport composes derive → gate → pool → render.
- [x] 4.4 Test: a proxied acquisition now proceeds, and reaches the engine with the endpoint of the process for its route.
- [x] 4.5 Test: a refusal still renders nothing.

## 5. Wiring

- [x] 5.1 `dispatch.ts` builds the pool wherever a browser engine is present, so capability and pool cannot disagree.
- [x] 5.2 Test: a browser source stays blocked without the capability and runnable with it.

## 6. Live verification

- [x] 6.1 Extend the opt-in live test: a proxied acquisition is routed through its proxy, asserted by a non-resolving host so a bypass fails rather than passing.
- [x] 6.2 A second acquisition on a different route is routed to *its* proxy — the case that produced the original refusal.
- [x] 6.3 Run them and record the result.

## 7. Verification

- [x] 7.1 Typechecks, suites, lint clean.
- [x] 7.2 Invariant checklist, with I10, I4, and TDR-011 identity binding called out.
- [x] 7.3 Update TDR-019's post-implementation finding and the roadmap to reflect the lifted refusal.
