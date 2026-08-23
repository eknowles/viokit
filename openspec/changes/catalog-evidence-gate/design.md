## Context

See `proposal.md` — Why. Two facts constrain the shape:

- **`source-catalog` does not depend on `@viokit/engine`**, deliberately: importing the engine pulls
  DuckDB into a discovery CLI. So the catalog cannot run a probe, and cannot read the evidence store.
- **`verify_access` already produces an `AccessObservation`** carrying the classification, the reason,
  and the ids of the artifacts it was derived from.

## Decisions

1. **The catalog accepts a verification; it does not produce one.**
   Promotion takes an `AccessObservation` from the caller. The alternative — having the catalog probe
   the source itself — would mean depending on the engine, which the package boundary exists to
   prevent.

2. **The gate checks the claim's shape and content, not the bytes.**
   It verifies the observation is *for this candidate*, that it *concluded something* (`observed` is
   not `unknown`), and that it *names evidence*. It cannot read those artifacts. This is a real limit
   and worth stating plainly: a caller could hand over a fabricated observation. What it buys is that
   the claim is now falsifiable — the evidence ids are in the shipped spec, the store is
   content-addressed and write-once, and anyone with the store can check it. That is the difference
   between an assertion and a claim, which is the whole point.

3. **`observed === "unknown"` is a refusal, not a warning.**
   A probe that concluded nothing is not a verification. This matters more than it sounds: after the
   front-door rule, a spec pointing at a homepage *always* yields `unknown`, so the gate also enforces
   that a promoted source addresses somewhere probeable.

4. **The evidence lands on the spec, not only on the candidate.**
   The pack file is what ships and what a deployment reads; the candidate record stays behind in a
   local SQLite database. `accessEvidence` on `SourceSpec` is what lets a reader of a pack file tell a
   checked source from an asserted one.

5. **`accessVerified` is derived on the catalog entry, never stored.**
   From `accessEvidence` being non-empty, alongside `runnable` and `frontDoor`. Same reason as those:
   a stored boolean would be a lie the moment the spec moved.

6. **`origin` is required on input, optional on the stored record.**
   New submissions must carry it; the 47 rows that predate the requirement still decode. Rejecting our
   own history at read time would be theatre — the demotion is what handles them.

7. **Nothing is deleted.**
   The candidates and the shipped sources stay. They lose an authority they never had, which is a
   change in what the system *claims*, not in what it holds. Deleting would also discard 47 usable
   leads for the sake of tidiness.

## Risks / Trade-offs

- **[A fabricated observation passes the gate]** → **Mitigation**: decision 2. Closing it fully means
  the catalog reading the evidence store, which is a package dependency this design deliberately does
  not take; the evidence ids make the fabrication detectable by anyone who does have the store.
- **[Promotion is now a two-step act]** — verify, then promote → **Mitigation**: that is the point, and
  `verify_access` is one call on the same operation table.
- **[Nothing can currently be promoted]** — every spec is a front door, so every probe returns
  `unknown` → **Mitigation**: accurate. Promotion was the step that let unchecked claims into packs;
  it should be closed until a source has an endpoint worth probing.
