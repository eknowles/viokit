# Tasks — Browser Transport

> Prereq: TDR-019 `decided`; Bun 1.4 in the workspace. Requires a Chrome-family browser to run the
> opt-in live test.

## 1. Seam changes

- [x] 1.1 Move `EgressDecision` into the shared seams.
- [x] 1.2 Replace the transport's credential argument with an `AcquisitionContext` carrying the credential and the egress decision.
- [x] 1.3 Update the HTTP, dataset, and dispatch transports and their tests for the new shape.
- [x] 1.4 The runtime passes the context it already computes.
- [x] 1.5 Test: the resolved route reaches the transport, for both direct and proxied policies.

## 2. Schema

- [x] 2.1 `Transport` gains `browser`.
- [x] 2.2 Test: a browser source decodes; existing transports are unaffected.

## 3. Launch derivation

- [x] 3.1 A pure `browserLaunchOptions(source, context, identity)` returning backend, argv, and data directory.
- [x] 3.2 A proxied route adds the proxy switch; a direct route adds none.
- [x] 3.3 Data directory per identity, keyed off the credential reference where there is one.
- [x] 3.4 WebKit under a proxy policy is a typed refusal.
- [x] 3.5 Tests for each rule, with no browser launched.

## 4. Transport

- [x] 4.1 A `BrowserEngine` seam: open a page with options, return rendered HTML.
- [x] 4.2 The `Bun.WebView` implementation behind it.
- [x] 4.3 `BrowserTransportLayer` producing evidence from the rendered document.
- [x] 4.4 Tests against a fake engine: options are honoured, refusals propagate, HTML becomes bytes.

## 5. Capability and runnability

- [x] 5.1 Declaring the browser transport adds `browser` to the deployment's capabilities.
- [x] 5.2 Test: a browser source is blocked without the capability and runnable with it, and the catalog agrees with acquisition.

## 6. Live verification

- [x] 6.1 An opt-in test that launches a real browser and acquires a local page, off by default.
- [x] 6.2 Run it manually and record the result.

## 7. Verification

- [x] 7.1 Typechecks, suites, lint clean.
- [x] 7.2 Invariant checklist, with I10, I4, and TDR-011 identity binding called out.
