# Wire the Browser Transport

## Why

`browser-transport` built and tested the transport but wired it to nothing. `AgentProgramLayer` provides no browser engine and declares no transport capabilities, so in every running deployment browser sources still report as blocked and the dispatch transport would refuse them anyway. The capability exists in the codebase and not in the product.

Two claims from that change also remain unproven, and were left unproven deliberately rather than faked: that a proxied browser acquisition actually routes through its bound proxy (I10), and that two identities do not share a session (TDR-011). Both were untestable with the harness at hand, not with the transport.

## What Changes

- **The deployment wires a browser engine** and declares the transports it provides, so `browser` joins `http` and `dataset` and browser sources become runnable where a browser exists.
- **Capability declaration follows what is actually wired**, rather than being asserted — a deployment without a browser engine keeps reporting browser sources as blocked, which stays the honest answer.
- **The proxy gap is closed by measurement, and the answer is not the one expected.** A conforming forward proxy showed that `--proxy-server` is a *launch* switch and browser processes are reused across acquisitions: the same proxied acquisition routes correctly when it starts the browser and is silently ignored when another acquisition started one first. The transport therefore **refuses proxied browser acquisition** rather than promising a route it cannot guarantee (I10). Direct-egress browser acquisition works and is proven live.
- **Session isolation is not asserted through the transport** for the same reason — process reuse makes it unobservable from here. The TDR-019 spike proved it directly across data directories.
- **The `people-identity` pack declares its browser-only sources as browser transport**, so the catalog reports them as runnable rather than as HTTP sources that would fail.

Not in this change: acquiring from a live third-party site (a local page proves the mechanism; hitting a real service is a decision about that service's terms, not about this code), session pooling, and login automation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `source-runtime`: a deployment declares the transports it provides, and that declaration is what runnability is derived from.

## Impact

- `packages/agent`: the program layer provides the browser engine and declares its transport capabilities.
- `packages/packs`: `people-identity`'s browser-only sources declare the browser transport.
- `packages/sources`: the live test gains a conforming proxy and a cookie-reporting page.
- Tests: capability declaration flips runnability; a proxied acquisition is observed at the proxy; an identity keeps its session and cannot read another's.
- The live tests remain outside the default suite — they need Chrome — and are run manually.
