# Tasks — Access Verification

> No TDR gate: no new store, transport, serialization, or UI dependency.

## 1. Transports report what they observed

- [x] 1.1 `TransportResult` gains an optional `status`.
- [x] 1.2 The HTTP transport carries the response's own content type, falling back to `application/octet-stream`, and its status.
- [x] 1.3 Dataset and browser keep reporting the types they know and omit status.
- [x] 1.4 Test: an HTML response records `text/html` in evidence, and a JSON one records its own type.
- [x] 1.5 Test: a `401` is visible to the runtime rather than looking like a successful fetch.

## 2. The classifier

- [x] 2.1 An `AccessSignals` record: content type, status, machine-readability, JS-dependence and its ratio, and the probed url.
- [x] 2.2 A pure `classifyAccess(signals)` returning an access value and the reason for it.
- [x] 2.3 Credential wall outranks representation: a `401`/`403` is `requires_key` even when the body is HTML.
- [x] 2.4 JSON/XML that parses is `open_api`; CSV and archive/attachment payloads are `dataset`; HTML is `browser_scrape`.
- [x] 2.5 An unrecognised combination is `unknown`, carrying why.
- [x] 2.6 Tests per rule, and for the precedence between them, with no network.

## 3. The probe

- [x] 3.1 `AccessObservation` in the shared schema: probed url, observed access, declared access, whether they agree, the signals, and the evidence ids behind them.
- [x] 3.2 `Engine.verifyAccess(sourceId)` acquiring through `SourceRuntime` — never a raw fetch (I4), against a spec whose declared `access` is cleared so the claim cannot block its own verification.
- [x] 3.3 For an HTML response, render the same url through the browser transport where the deployment has one, and derive JS-dependence from the difference.
- [x] 3.4 Where no browser is wired, say so in the signals rather than assuming.
- [x] 3.5 Test: the observation names the evidence it was derived from, and those artifacts are readable.
- [x] 3.6 Test: an unknown source id fails as an unknown catalog entry, not a fetch error.

## 4. Front-ends

- [x] 4.1 `verify_access` on the shared operation table.
- [x] 4.2 Test: parity across MCP and CLI (I8), and the payload decodes at the boundary (I6).

## 5. Verification

- [x] 5.1 Typechecks, suites, lint clean.
- [x] 5.2 Invariant checklist, with I4, I1, and I6 called out.
- [x] 5.3 Roadmap note: `access-reclassification` now has a mechanism behind it.
