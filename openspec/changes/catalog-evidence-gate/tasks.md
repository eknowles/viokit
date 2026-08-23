# Tasks — The Catalog Requires Evidence

## 1. Provenance on submission

- [x] 1.1 `origin` required on `SourceCandidateInput`, optional on the stored record.
- [x] 1.2 Test: a submission that cannot be traced back is refused.

## 2. The promotion gate

- [x] 2.1 An `Unverified` failure in the catalog's seams.
- [x] 2.2 `promoteSource` takes an `AccessObservation`, decoded at the boundary (I6).
- [x] 2.3 Refuse an observation for a different source, one that concluded nothing, and one naming no evidence.
- [x] 2.4 Both front-ends take the verification.
- [x] 2.5 Tests for each refusal.

## 3. Evidence travels with the spec

- [x] 3.1 `SourceSpec.accessEvidence`.
- [x] 3.2 Promotion writes the observed access and its evidence into the spec.
- [x] 3.3 `SourceCandidate.verification` records what a probe observed.
- [x] 3.4 Test: a promoted spec carries the evidence its classification came from.

## 4. The demotion

- [x] 4.1 `accessVerified` on a catalog source entry, derived from `accessEvidence`.
- [x] 4.2 Test: every currently registered source reports as unverified.
- [x] 4.3 Confirm against the real deployment: 38 sources, 0 verified.

## 5. Verification

- [x] 5.1 Typechecks, suites, lint clean.
- [x] 5.2 Invariant checklist.
- [x] 5.3 Roadmap: record what the catalog actually is, and what unblocks it.
