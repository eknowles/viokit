# Tasks — Investigations

> **Blocked: TDR-025 must be `decided` first.** It settles how an investigation and its branches are
> represented over an append-only log, which is the shape of nearly everything below. The tasks are
> written to be true whichever option it picks; the ones that name a representation are marked.

## 0. The gate

- [x] 0.1 Finish TDR-025's analysis and recommendation; establish the two things it said needed
      establishing. Both measured 2026-08-23: branch-chain replay is cheaper than today's flat fold at
      every depth tested, and the missing-predicate risk lives in one function, because queries read
      the projection rather than the log.
- [x] 0.2 Human review; mark `decided`.

## 1. The concept

- [x] 1.1 `Investigation` and `Branch` in the shared schema: identity, name, parent, status.
- [x] 1.2 A step carries its scope (shape per TDR-025).
- [x] 1.3 Decide and record what an investigation's identity is, such that two machines cannot collide
      on a case that was handed between them (TDR-025 open question). **A UUID**: names are for people
      and change, identity is not, and nothing about a case is stable enough to derive one from.
- [x] 1.4 Tests: the schema round-trips; a step without a scope does not decode.

## 2. The store

- [x] 2.1 The graph seam is bound to an investigation (per TDR-025).
- [x] 2.2 Replay scopes to one investigation.
- [x] 2.3 The four queries scope with it.
- [x] 2.4 Migration: the existing unpartitioned log becomes one investigation, named for what it is.
- [x] 2.5 Test: a step recorded in one investigation appears in no other's replay, log, or queries.
- [x] 2.6 Test: replay stays deterministic per investigation (I3), and offline-deterministic (I11).

## 3. Branches

- [x] 3.1 Fork an investigation at its current state.
- [x] 3.2 A branch replays through its ancestry to the fork, then its own steps.
- [x] 3.3 Discard a branch without removing a step from the log.
- [x] 3.4 Test: a branch starts from what its parent knew, and work on it leaves the parent unchanged.
- [x] 3.5 Test: forking an investigation with substantial history does not copy that history.

## 4. Export

- [x] 4.1 `exportBundle` is scoped to the open investigation. It reads the same `log` and `replay` the
      queries do, so scoping those scoped it — no parameter was needed, which is the architecture
      TDR-025 relied on paying off.
- [x] 4.2 Test: a bundle contains the case's trail and nothing from any other investigation.
- [x] 4.3 Decide whether a discarded branch travels with its case (TDR-025 open question) and test the
      answer. **Today it does not**: a branch is its own investigation, and an export carries the
      ancestry a case *inherits*, never the branches taken from it. Pinned by a test. Whether a
      reviewer should see rejected hypotheses stays open — that is a governance question, not a
      storage one.

## 5. Shared evidence

- [x] 5.1 Identical bytes acquired in two investigations remain one artifact.
- [x] 5.2 An explicit operation reporting which artifacts more than one investigation cites.
- [x] 5.3 Test: the overlap is reported, and no ordinary query can be mistaken for it.

## 6. Front-ends and view state

- [x] 6.1 Lifecycle operations on the shared table — create, list, open, fork, discard, export.
- [x] 6.2 View-state keys use the real investigation, replacing TDR-012's placeholder.
- [x] 6.3 Test: parity across front-ends (I8); view state still never enters the step log (I12).

## 7. Console

- [x] 7.1 A current investigation, switchable.
- [x] 7.2 Fork and discard from the interface.
- [x] 7.3 Every existing surface reads the current investigation rather than the whole graph.

## 8. Verification

- [x] 8.1 Typechecks, suites, lint clean.
- [x] 8.2 Invariant checklist, with I2, I3, I11, and I12 called out.
- [x] 8.3 Roadmap: record that the `investigations` capability CONTRACT has always claimed now exists,
      and what it unblocks (TDR-023, TDR-024).

## Found by using it

- **The open investigation only lived in memory.** Running the CLI showed one process opening a case
  and the next recording into another — work landing in the wrong case, which is the exact silent
  failure this feature exists to prevent. Persisted, and pinned by a test.
