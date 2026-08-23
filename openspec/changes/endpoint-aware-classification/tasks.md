# Tasks — Classifying a Source Needs an Endpoint

## 1. The classifier

- [x] 1.1 `isBareHost`, hand-parsed, with tests for path, query, and fragment.
- [x] 1.2 HTML from a bare host is `unknown`, naming the repair.
- [x] 1.3 A non-page response from a bare host still classifies.
- [x] 1.4 403 is inconclusive; 401 stays `requires_key`.
- [x] 1.5 Tests for each rule.

## 2. The probe

- [x] 2.1 Carry the render failure into the signals instead of discarding it.
- [x] 2.2 Distinguish "no browser" from "rendering did not succeed".

## 3. The catalog

- [x] 3.1 `frontDoor` on a source entry, derived from the same function.
- [x] 3.2 Test: a front-door spec is reported as one, an endpoint spec is not.

## 4. Verification

- [x] 4.1 Typechecks, suites, lint clean.
- [x] 4.2 Re-run the sweep and record the findings in the proposal.
- [x] 4.3 Roadmap: the remaining Track A work is endpoint urls, not reclassification.
