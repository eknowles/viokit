## Context

See `proposal.md` — Why. Five facts about the current code shape this design:

- **`SourceAccess` is `open_api | dataset | browser_scrape | requires_key | unknown`**, shared by
  candidates and specs. It is the vocabulary a verdict has to speak.
- **`TransportResult` is `{ bytes, contentType }`**, and the HTTP transport fills `contentType` with
  the constant `"application/octet-stream"`. There is no status anywhere.
- **Effect's `HttpClient` does not fail on 4xx** — a `401` arrives as an ordinary response with a
  body. Without the status, an authentication wall is indistinguishable from a successful fetch, and
  `requires_key` is unverifiable.
- **`runnabilityOf` already derives from `access`**, so a corrected classification improves what the
  catalog advertises without any further wiring.
- **`source-catalog` does not depend on `@viokit/engine`**, and importing the engine pulls DuckDB. The
  probe cannot live in the catalog package without dragging a graph store into a discovery CLI.

Constraints: Effect 4.0.0-beta.103; acquisition goes through `SourceRuntime` and never around it
(I4/I10); evidence is write-once and content-addressed (I1); decode at every boundary (I6).

## Goals / Non-Goals

**Goals:**
- A classification that can be checked, and re-checked, against stored bytes.
- Signals that actually discriminate, rather than signals that are easy to collect.
- Honest inconclusiveness: `unknown` with a reason beats a confident wrong answer.

**Non-Goals:**
- Deciding a whole *site's* access from one URL — see the risk below; the probe verifies the endpoint
  the spec names.
- Persisting observations, or mutating a spec or candidate as a side effect of probing.
- Extending the `SourceAccess` vocabulary (see Open Questions).
- Politeness policy — rate limits, robots, ToS. The probe is one request per source and inherits the
  spec's existing rate-limit and egress policy.

## Decisions

1. **The probe runs acquisitions through `SourceRuntime`, like everything else.**
   It is the same pipeline, so cache mode, egress, rate limit, retry, and credential resolution all
   apply, and the probe cannot become a hole in policy (I4/I10). A bespoke fetch would have been
   simpler and would have been precisely the forbidden crossing.

2. **`TransportResult` gains `status`, optional.**
   Only HTTP has one; dataset and browser omit it rather than inventing a `200`. Optional-and-absent
   says "this transport has no such concept", which is true, where a fabricated success would be a
   lie the classifier would then read.

3. **The HTTP transport reports the response's own content type.**
   Fixing the placeholder is not optional here — content type is the single most discriminating
   signal, and every artifact already in the store has been mislabelled. Falls back to
   `application/octet-stream` when the response declares nothing, which is what that value should
   have meant all along.

4. **JavaScript-dependence is measured, not assumed.**
   For an HTML response, the probe renders the same URL through the browser transport (when the
   deployment has one) and compares the visible text of the two. A page whose rendered text is
   substantially larger than its served text is JS-dependent; one that matches is reachable without a
   browser. This is the only signal that distinguishes a genuinely browser-only interface from a page
   an HTTP transport could have fetched, and it exists only because the browser transport does.

5. **A verdict names its evidence.**
   The observation carries the evidence ids it was derived from. That is what makes it a verification
   rather than a fresh guess: the bytes are write-once and content-addressed, so anyone can re-derive
   the verdict or dispute it. An observation without evidence ids would be the same unfalsifiable
   claim we are replacing.

6. **The classifier is a pure function of the signals.**
   Acquisition is effectful; deciding what the signals mean is not. Keeping the rules pure means every
   rule is testable without a network, which is how they stay honest as they accumulate.

7. **Ordering of the rules is deliberate: credential wall first.**
   A `401` page is usually HTML, and a content-type rule applied first would classify a key-gated API
   as a scrapable page. Authentication is a fact about *reachability*, so it outranks a fact about
   representation.

8. **An unrecognised combination yields `unknown` with a reason, not a best guess.**
   `runnabilityOf` already treats `unknown` as "attempt it and flag it", so an inconclusive probe
   degrades to today's behaviour rather than asserting something new.

9. **The probe lives in `packages/engine` and is exposed on the agent surface.**
   It is acquisition plus evidence, which is the engine's business, and the alternative — putting it
   in `source-catalog` — would pull DuckDB into the discovery CLI. Closing the loop back to a
   candidate stays an explicit act by the caller through the catalog's existing `enrich`, which keeps
   the two packages independent.

10. **The probe clears the claim it is testing.**
   Found in implementation: `runnabilityOf` refuses a source classified
   `browser_scrape` when no browser is wired, so the sources most in need of
   checking are exactly the ones a deployment would refuse to fetch — the claim
   blocking its own verification. The probe therefore acquires against a spec
   whose `access` is cleared. This is the common case rather than a corner: the
   candidate store holds 6 sources classified `browser_scrape` and only one with
   a browser transport. `transport` is deliberately *not* cleared — that is a
   real capability requirement rather than a claim — and a declared credential
   that does not resolve still refuses, because that is a fact about the
   deployment.

## Risks / Trade-offs

- **[One URL is not a site]** — a source whose spec points at a homepage will be classified from that
  homepage, which is the same mistake the harness made → **Mitigation**: the observation states the
  URL it probed, and the verdict is about that endpoint. A spec pointing somewhere unrepresentative is
  a spec problem the observation makes visible rather than hides.
- **[A probe is a real request to a third party]** → **Mitigation**: one request per source, through
  the runtime, under the spec's existing rate-limit and egress policy; nothing bulk, and nothing that
  runs without being asked.
- **[The JS-dependence heuristic has a threshold]** — a ratio is a judgement call, and a page with
  heavy boilerplate could tip either way → **Mitigation**: the ratio is reported in the signals, so a
  reader can see how marginal the call was rather than only its conclusion.
- **[A verdict can disagree with a spec that is right]** — a source may legitimately serve HTML at the
  probed URL while its data lives at a documented endpoint → **Mitigation**: the probe reports, it
  does not rewrite; applying the verdict is a separate, explicit act.
- **[Fixing the content type changes what new evidence records]** — artifacts written before this
  change say `application/octet-stream` and will not be corrected → **Mitigation**: evidence is
  write-once by design (I1); a wrong label on old artifacts is a fact about when they were written,
  and rewriting them would be the worse violation.

## Migration Plan

Additive. `TransportResult.status` is optional, so existing transports compile and behave unchanged.
No stored data migrates: evidence is immutable, so old artifacts keep the content type they were
written with. Rollback is removing the probe and the operation; the transport's honesty about content
type is worth keeping either way.

## Open Questions

- **The vocabulary cannot say "HTML, but no browser required."** A page that is scrapable over plain
  HTTP is reported as `browser_scrape` with a `jsDependent: false` signal, because inventing a sixth
  `SourceAccess` value would ripple through candidates, specs, packs, and runnability — a bigger
  change than this one. The signal makes the distinction visible; whether the vocabulary should carry
  it is a separate question.
- Whether observations should eventually be persisted, so the catalog can advertise *verified*
  separately from *declared* without re-probing.
- Whether a probe should follow a documented API path when the spec's URL is a homepage, rather than
  reporting on the homepage.
