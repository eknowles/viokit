# Tasks — Investigations

> **Blocked: TDR-025 must be `decided` first.** It settles how an investigation and its branches are
> represented over an append-only log, which is the shape of nearly everything below. The tasks are
> written to be true whichever option it picks; the ones that name a representation are marked.

## 0. The gate

- [x] 0.1 Finish TDR-025's analysis and recommendation; establish the two things it said needed
      establishing. Both measured 2026-08-23: branch-chain replay is cheaper than today's flat fold at
      every depth tested, and the missing-predicate risk lives in one function, because queries read
      the projection rather than the log.
- [ ] 0.2 Human review; mark `decided`.

## 1. The concept

- [ ] 1.1 `Investigation` and `Branch` in the shared schema: identity, name, parent, status.
- [ ] 1.2 A step carries its scope (shape per TDR-025).
- [ ] 1.3 Decide and record what an investigation's identity is, such that two machines cannot collide
      on a case that was handed between them (TDR-025 open question).
- [ ] 1.4 Tests: the schema round-trips; a step without a scope does not decode.

## 2. The store

- [ ] 2.1 The graph seam is bound to an investigation (per TDR-025).
- [ ] 2.2 Replay scopes to one investigation.
- [ ] 2.3 The four queries scope with it.
- [ ] 2.4 Migration: the existing unpartitioned log becomes one investigation, named for what it is.
- [ ] 2.5 Test: a step recorded in one investigation appears in no other's replay, log, or queries.
- [ ] 2.6 Test: replay stays deterministic per investigation (I3), and offline-deterministic (I11).

## 3. Branches

- [ ] 3.1 Fork an investigation at its current state.
- [ ] 3.2 A branch replays through its ancestry to the fork, then its own steps.
- [ ] 3.3 Discard a branch without removing a step from the log.
- [ ] 3.4 Test: a branch starts from what its parent knew, and work on it leaves the parent unchanged.
- [ ] 3.5 Test: forking an investigation with substantial history does not copy that history.

## 4. Export

- [ ] 4.1 `exportBundle` takes an investigation.
- [ ] 4.2 Test: a bundle contains the case's trail and nothing from any other investigation.
- [ ] 4.3 Decide whether a discarded branch travels with its case (TDR-025 open question) and test the
      answer.

## 5. Shared evidence

- [ ] 5.1 Identical bytes acquired in two investigations remain one artifact.
- [ ] 5.2 An explicit operation reporting which artifacts more than one investigation cites.
- [ ] 5.3 Test: the overlap is reported, and no ordinary query can be mistaken for it.

## 6. Front-ends and view state

- [ ] 6.1 Lifecycle operations on the shared table — create, list, open, fork, discard, export.
- [ ] 6.2 View-state keys use the real investigation, replacing TDR-012's placeholder.
- [ ] 6.3 Test: parity across front-ends (I8); view state still never enters the step log (I12).

## 7. Console

- [ ] 7.1 A current investigation, switchable.
- [ ] 7.2 Fork and discard from the interface.
- [ ] 7.3 Every existing surface reads the current investigation rather than the whole graph.

## 8. Verification

- [ ] 8.1 Typechecks, suites, lint clean.
- [ ] 8.2 Invariant checklist, with I2, I3, I11, and I12 called out.
- [ ] 8.3 Roadmap: record that the `investigations` capability CONTRACT has always claimed now exists,
      and what it unblocks (TDR-023, TDR-024).
