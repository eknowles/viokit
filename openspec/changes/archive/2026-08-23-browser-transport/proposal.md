# Browser Transport

## Why

Browser-only sources are the largest category the engine cannot reach. `source-runnability-manual-acquisition` made the deployment honest about them — they report as blocked, with a reason — and `secret-provisioning` cleared the credential half of the same problem. This clears the transport half.

TDR-019 settled the technology on spike evidence: `Bun.WebView` binds to a proxy through Chrome launch switches and isolates sessions by data directory, which are the two properties I10 and TDR-011 require. Both contradicted the published documentation, which is why the decision rests on measurement.

## What Changes

- **A `browser` transport** driving headless Chrome through `Bun.WebView`: navigate, settle, and capture the rendered document as evidence.
- **The transport receives the runtime's acquisition context** — the resolved credential *and* the egress decision — instead of just a credential. A browser cannot honour an egress policy it was never told about, and a transport that quietly ignores one violates I10.
- **Egress binding**: a proxied acquisition launches the browser bound to that proxy. A source whose policy resolves to a proxy SHALL NOT be fetched by a browser that cannot be bound to it.
- **Identity isolation**: each identity gets its own browser data directory, so cookies and sessions from one never reach another.
- **`browser` joins the declared transport capabilities** when the layer is present, so browser-only sources flip from blocked to runnable and the catalog says so.
- **WebKit is refused for proxied work.** It exposes no proxy control, so binding is impossible; the transport fails loudly rather than silently fetching direct.

Not in this change: session pooling across acquisitions, anti-bot handling, login automation, and screenshots as evidence — all follow once the transport exists.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `core-schema`: `Transport` gains a browser variant.
- `source-runtime`: the transport is told the egress decision as well as the credential, and a browser acquisition that cannot honour its egress policy fails rather than proceeding.

## Impact

- `packages/schema`: `Transport` gains `browser`; an `AcquisitionContext` (credential + egress decision) replaces the credential argument on the transport seam; `EgressDecision` moves into the seams so the seam can name it.
- `packages/engine`: the runtime passes the context it already computes.
- `packages/sources`: a browser transport, plus a narrow seam over `Bun.WebView` so the launch decisions — proxy switches, data directory, backend choice — are testable without launching a browser.
- **Requires Bun 1.4** (`Bun.WebView`) and a Chrome-family browser on the host.
- Tests: launch options derived correctly per egress decision and identity; WebKit refused under a proxy policy; browser sources runnable only where the capability is declared. One opt-in test launches a real browser, off by default so the suite stays hermetic.
