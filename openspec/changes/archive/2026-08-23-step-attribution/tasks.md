# Tasks — Step Attribution

> Closes the actionable half of I7. No TDR: no new dependency, store, or transport.

## 1. Schema

- [x] 1.1 `SourceSpec.version`, defaulting to an explicit unversioned marker.
- [x] 1.2 `Step` gains optional `transformId`, `sourceId`, and `sourceVersion`.
- [x] 1.3 Boundary tests: a declared version is carried; an undeclared one reads as unversioned; a step decodes with and without attribution.

## 2. Runner

- [x] 2.1 The transform runner stamps the transform, source, and source version onto every step it stages.
- [x] 2.2 Correlate-derived steps carry no attribution.
- [x] 2.3 Tests: staged steps are attributed; correlate steps are not; attribution survives commit and replay.

## 3. Console

- [x] 3.1 Provenance names the transform and versioned source where a step records them.
- [x] 3.2 A step without attribution claims none.
- [x] 3.3 Tests: both cases render.

## 4. Verification and honesty

- [x] 4.1 Typechecks, suites, lint clean via devbox.
- [x] 4.2 Drive it live: run a transform, commit, and read the transform and versioned source off the committed step.
- [x] 4.3 Record in `CONTRACT.md` that I7's first half is met and its second half — pinning at replay — is not yet meaningful, so the gap is visible rather than assumed closed.
