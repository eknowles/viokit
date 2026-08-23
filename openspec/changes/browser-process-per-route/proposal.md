# Browser Process per Egress Route

## Why

`wire-browser-transport` shipped with proxied browser acquisition **refused outright**, and the
refusal was correct: `--proxy-server` is a launch switch, `Bun.WebView` spawns Chrome once per Bun
process, and every later view reuses that process. An acquisition that runs second silently inherits
the first one's route. Traffic leaving by the wrong route while the evidence records `proxy` is the
bypass I10 exists to prevent, so refusing was the only honest option.

The cost lands on exactly the sources that can least afford it. `browser_scrape` sources are already
the ones no HTTP transport can reach, and the proxied ones among them are the ones where egress
control matters most. P5 Track A cannot re-open the category while the refusal stands.

TDR-022 measured the constraint properly and found a shape that removes it. The governing rule is not
"Chrome is spawned once per process" but the broader one underneath it: **all simultaneously-open
`Bun.WebView`s in one Bun process share a single Chrome connection** — which is true of the
connect-by-URL path as much as the spawn path. Given that, a guaranteed route means owning the
process the route belongs to.

## What Changes

- **Viokit spawns and owns Chrome, one process per `(identity, route)`**, instead of letting
  `Bun.WebView` spawn it from `argv`. The transport attaches a view to the process it wants by
  DevTools URL. The binding stops being a request and becomes a property of the process.
- **A pooled, scoped process registry.** Processes are spawned on first use for a pair, kept warm
  across acquisitions, and killed when the layer's scope closes. Readiness is the
  `DevToolsActivePort` file, polled — not a delay.
- **A route gate serializes acquisitions that would cross routes**, because concurrent views on
  different routes are silently wrong. Acquisitions on the *same* route still run concurrently, which
  TDR-022's spike proved safe.
- **Browser profiles are keyed by `(identity, route)`, not by identity alone.** Two Chrome processes
  cannot share a `--user-data-dir`, and an identity's session is bound to the route it was
  established on — replaying a session from a different exit is not something to do by accident.
- **The blanket proxy refusal is lifted.** What remains refused is what is still genuinely
  unbindable: a WebKit backend under a proxy policy, and a proxy route that names no proxy.

Not in this change: cross-route concurrency (that needs a Bun process per route — TDR-022's Option D,
and nothing has asked for it), idle-process reaping beyond scope close, and the `acquisitionPath`
question about recording that a browser rendered a page, which TDR-019 left open and is not about
routing.

## Capabilities

### New Capabilities

None — this extends an existing capability.

### Modified Capabilities

- `source-runtime`: a browser acquisition can honour a proxied route instead of refusing it; browser
  sessions are isolated per identity *and* route; acquisitions that would cross routes are serialized.

## Impact

- `packages/sources`: `browser-launch.ts` yields a route (pool key, argv, profile directory, backend)
  plus the page to open, rather than a set of launch switches; a new `browser-pool.ts` owning the
  Chrome processes and the route gate; `browser.ts`'s engine seam takes a DevTools endpoint rather
  than launch switches; `dispatch.ts` wires the pool where a browser engine is present.
- Tests: route derivation per policy, pool keying and reuse, the gate's exclusion across routes and
  admission within one, refusals that remain, and an opt-in live test that asserts the route was
  *taken* — by the non-resolving-host method from TDR-022, since asserting that a switch was passed
  is what missed this the first time.
- Deployment: browser process count is now `|identities| × |routes|` in use, and Chrome is spawned by
  Viokit rather than by Bun.
- TDR-022 is `decided`; no other technology choice is introduced.
