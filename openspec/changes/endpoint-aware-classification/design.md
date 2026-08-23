## Context

See `proposal.md` — Why, and its sweep table. This change exists because a design risk that was
recorded as a risk turned out to be the dominant case in practice, which is the best reason to
revisit a decision.

## Goals / Non-Goals

**Goals:**
- A verdict the catalog can act on without making itself worse.
- Inconclusiveness that names what would resolve it.
- Make "registered but not wired up" a visible property rather than folklore.

**Non-Goals:**
- Guessing endpoint urls (`/api`, `/v1`) and probing those. A guessed endpoint that 404s proves
  nothing, and one that answers proves something about a url nobody chose.
- Changing any `access` value from this sweep — see the proposal's last paragraph.

## Decisions

1. **HTML from a bare host is `unknown`, not `browser_scrape`.**
   The verdict has to be one a reader can act on. "This homepage is a page" is true and useless, and
   dressed as `browser_scrape` it is actively harmful: `runnabilityOf` would then refuse the source in
   any deployment without a browser. Refusing to classify keeps today's behaviour (`unknown` is
   attempted and flagged) and names the repair.

2. **A bare host is anything with no path, query, or fragment.**
   `https://x.test` and `https://x.test/` are front doors; `https://x.test/api` is not. Deliberately
   crude: the question is whether a human chose *where in the site to point*, and a trailing slash is
   not a choice. Parsed by hand because `packages/schema` carries no lib types.

3. **A non-page response from a front door still classifies.**
   A host that answers JSON at its root really is an API. The refusal is about HTML specifically,
   where the ambiguity lies.

4. **403 becomes inconclusive; 401 stays `requires_key`.**
   401 means "authenticate"; 403 means "no". The sweep's three 403s came from large sites that block
   unidentified clients, and reading those as key-gated would have invented a credential requirement.
   Losing the genuinely key-gated APIs that answer 403 is the cost, and it is the right side to err
   on: `unknown` is attempted and flagged, `requires_key` without auth is refused outright.

5. **`frontDoor` is derived on the catalog entry, never stored.**
   It is a property of the spec's url, like runnability is a property of the spec and the deployment.
   The same function serves the classifier and the catalog, so what the catalog reports and what the
   probe refuses cannot drift.

6. **The render failure is carried, not swallowed.**
   `Effect.result` discarding the error is what hid a real wiring bug behind "could not tell" — the
   dispatch transport was never given its browser engine, so every browser render failed while the
   deployment claimed the capability. An unexplained inconclusive result is a place bugs hide.

## Risks / Trade-offs

- **[A genuinely browser-only source whose url is its homepage now reports `unknown`]** → **Mitigation**:
  it did before this change too, in effect — the `browser_scrape` verdict was right by accident, from
  evidence that did not support it. `frontDoor` makes the missing url visible, which is the fix.
- **[A key-gated API answering 403 now reads `unknown`]** → **Mitigation**: `unknown` is attempted and
  flagged rather than refused, so the failure surfaces at acquisition with the real status.
- **[`frontDoor` adds a field every catalog consumer sees]** → **Mitigation**: optional, derived, and
  absent for transforms and types.
