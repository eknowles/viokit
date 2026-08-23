## Context

See `proposal.md` — Why, and TDR-019 for the technology and its spike evidence. What shapes the implementation:

- `EgressDecision` (`{ path: "live" | "proxy", viaProxy?: string }`) is computed by the runtime and currently **never leaves it** — the transport seam is `fetch(source, credential)`. A browser that is not told the route cannot honour it.
- `Transport` is `"http" | "dataset"`. `TransportKind` (in `runnability.ts`) already anticipates `"browser"`, so runnability flips as soon as the capability is declared.
- `Bun.WebView`'s Chrome backend takes launch switches through `backend.argv`, and isolates sessions by `dataStore.directory`. Both were measured, not read (TDR-019).

## Goals / Non-Goals

**Goals:**
- A browser acquisition that is bound to the runtime's egress decision, or fails.
- Identity isolation that is a property of how the browser is launched, not of discipline.
- Launch decisions testable without launching a browser.

**Non-Goals:**
- No session pooling, no login automation, no anti-bot handling, no screenshots-as-evidence.
- No WebKit support for proxied work — see decision 4.
- No change to how evidence is stored or transforms consume it; a rendered page is bytes like any other.

## Decisions

1. **The transport seam takes an `AcquisitionContext`, not a credential.**
   `fetch(source, context?)` where the context carries the resolved credential *and* the egress decision. Adding a third positional argument for the route would have worked and would have been worse; more importantly, the context is the natural home for the next thing a transport needs to be told. Alternative considered: leaving the seam alone and having the browser transport read egress itself (rejected — a transport choosing its own route is the I10 violation this change exists to prevent).

2. **`EgressDecision` moves into the shared seams.**
   It lives in `packages/engine/src/egress.ts` today, but a seam in `@viokit/schema` cannot name a type from the engine. Moving it is mechanical and puts it where the other seam types already are.

3. **Launch options are derived by a pure function, and that is what tests assert.**
   `browserLaunchOptions(source, context, identity)` returns the backend, `argv`, and data directory. Every rule worth testing — proxy switch present for a proxied route, absent for direct, data directory per identity, WebKit refused under proxy — is a property of that function's output. A browser only has to launch in one opt-in test.

4. **WebKit under a proxy policy is a typed failure, not a silent direct fetch.**
   The macOS-default backend cannot be bound to a proxy (TDR-019). The transport therefore refuses: a browser-rendered fetch that quietly ignores the egress policy is exactly the bypass I10 forbids, and it would be invisible in the evidence because the acquisition path would still read `proxy`.

5. **Identity is the credential reference when there is one, and a shared default otherwise.**
   Sessions key off the same reference `SourceAuth` names, so "the identity a credential belongs to" and "the browser profile it uses" are the same thing. Sources with no credential share one anonymous profile rather than each getting their own, which would defeat session reuse for no benefit.

6. **The browser is reached through a narrow `BrowserEngine` seam.**
   One method: open a page with given options and return its rendered HTML. The `Bun.WebView` implementation is thin; tests substitute a fake. This also contains the risk TDR-019 flagged — a surface whose documentation was measurably wrong is one to keep behind a seam.

7. **Evidence is the rendered document.**
   `evaluate("document.documentElement.outerHTML")` after navigation settles, captured as `text/html`. Screenshots are a later addition; the rendered DOM is what a transform projects from.

## Risks / Trade-offs

- **[Changing the transport seam touches every transport and its tests]** → **Mitigation**: mechanical, and the compiler finds all of it; the seam is internal, with no external consumers.
- **[`Bun.WebView` is young and its docs were measurably wrong]** → **Mitigation**: the `BrowserEngine` seam (decision 6), plus tests that pin the launch decisions we depend on rather than trusting the documentation.
- **[A browser acquisition is slow and heavy compared with an HTTP fetch]** → **Mitigation**: accepted — it is the price of reaching sources that have no API. Pooling is a follow-up once there is usage to measure.
- **[Chrome must exist on the host]** → **Mitigation**: the transport declares the `browser` capability only when it is wired in, so a deployment without Chrome simply reports browser sources as blocked, which is the honest answer rather than a runtime failure.
- **[Rendered HTML is not a stable contract]** — pages change → **Mitigation**: out of scope here; that is a projection concern, and the same is true of any scraped source.

## Migration Plan

Additive apart from the seam signature. No pack declares a browser source yet, so nothing changes behaviourally until one does. Deployments that do not wire the browser transport are unaffected — `browser` stays out of their declared capabilities and browser sources stay blocked, exactly as today.

## Open Questions

- Whether a browser acquisition's `acquisitionPath` should record that a browser rendered it, beyond `live`/`proxy` (I9). Raised in TDR-019; deferred because it changes the evidence schema and deserves its own decision.
