# Tasks — Promoted Sources Are Registered

> No TDR gate: no new store, transport, serialization, or UI dependency.

## 1. Register what was promoted

- [x] 1.1 A source-only `manifest.ts` for each of the eight packs without one.
- [x] 1.2 `defaultPacks` names every pack.
- [x] 1.3 Verify by running the deployment: `catalog_list --kind source` reports every promoted source.

## 2. Keep it registered

- [x] 2.1 A conformance test: every `SourceSpec` a pack's `sources.ts` exports is named by that pack's manifest.
- [x] 2.2 The same test fails for a pack with no manifest at all — the case that actually occurred.

## 3. The promoter writes where the deployment reads

- [x] 3.1 A `PackRoot` seam, defaulting to the real pack directory.
- [x] 3.2 The promoter resolves its path from it rather than from the working directory.
- [x] 3.3 Test: a promoted source lands in the pack tree, decoded and valid.
- [x] 3.4 Test: a second promotion appends rather than replacing.
- [x] 3.5 Test: a spec that does not decode is refused before anything is written.

## 4. Verification

- [x] 4.1 Typechecks, suites, lint clean.
- [x] 4.2 Invariant checklist.
- [x] 4.3 Roadmap: strike the untested-promoter debt; note the verifiable surface is now 38 sources.
