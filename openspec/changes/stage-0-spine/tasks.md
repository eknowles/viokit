## 1. Workspace setup

- [ ] 1.1 Add `packages/*` to root `package.json` workspaces; create `packages/schema`, `packages/engine`, `packages/sources` with `package.json`, `tsconfig.json`, and vitest config
- [ ] 1.2 Add and pin the Effect v4 aligned dependency set (`effect` + `@effect/*`) across the workspace per TDR-001; record the exact versions in the decisions index
- [ ] 1.3 Verify `ultracite check` and `tsc --noEmit` pass on the empty packages

## 2. Core schema contract (`packages/schema`)

- [ ] 2.1 Define primitive schemas: `Identifier`, temporal extent, spatial extent, `Entity`, `Relation`, `Event`
- [ ] 2.2 Define `Evidence` (raw bytes, content hash id, `AcquisitionPath`), `Step`, and `AcquisitionPath` (`live`/`cache`/`proxy`)
- [ ] 2.3 Define the capability-boundary interface types: `EvidenceStore`, `GraphStore`, `SourceRuntime`
- [ ] 2.4 Add encode/decode + temporal-validity + future-dated-evidence validation at the schema boundary
- [ ] 2.5 Tests: primitive round-trips (encode→decode), invalid temporal extent rejected, future-dated evidence rejected

## 3. In-memory engine (`packages/engine`)

- [ ] 3.1 Implement in-memory `EvidenceStore` (content-hash addressing, write-once, immutable)
- [ ] 3.2 Implement in-memory `GraphStore` (append-only step log; graph state as a fold over the log)
- [ ] 3.3 Implement graph-insert boundary requiring a `Step` referencing ≥1 evidence id (rejects bare inserts)
- [ ] 3.4 Implement replay: re-fold the step log reproduces graph state
- [ ] 3.5 Tests: I1 immutability, I2 provenance closure, I3 replay determinism, I5/I6 boundary validation

## 4. HTTP source (`packages/sources`)

- [ ] 4.1 Define a minimal `SourceSpec` (transport, response schema → projection) and wire it through `SourceRuntime`
- [ ] 4.2 Implement one real HTTP source producing `Evidence` with an `AcquisitionPath`
- [ ] 4.3 Make the HTTP dependency injectable/configurable and mockable in tests
- [ ] 4.4 Test: an HTTP source run yields recorded evidence with correct `AcquisitionPath` (I9)

## 5. End-to-end spine proof

- [ ] 5.1 Add an example/script running source → evidence → graph insert → query by id → replay
- [ ] 5.2 Verify replay reproduces the same graph state as the original run
- [ ] 5.3 Run the full exit checklist: `ultracite check`, `tsc --noEmit`, vitest, invariant checklist (CONTRACT I1–I12) green
