# Tasks — SHA-256 Evidence Identity

> Prereq: TDR-021 `decided`. Breaking: every stored evidence id changes; no migration is possible.

- [x] 1.1 `sha256Hex` in `hash.ts`, with `fnv1aHex` documented as non-attesting.
- [x] 1.2 Both evidence stores derive the id from the SHA-256 of the bytes.
- [x] 1.3 The cache request fingerprint moves to SHA-256.
- [x] 1.4 Step ids, view-state paths, and candidate keys stay FNV-1a, with reasons recorded.
- [x] 1.5 Export attests with the artifact's own id; the disclaimer shrinks to what is still true.
- [x] 1.6 Tests: id equals the digest; different bytes differ; identical bytes dedupe; bundle digest equals id and the steps reference it.
- [x] 1.7 Amend `CONTRACT.md` I1 to state what is enforced.
- [x] 1.8 Verify a real bundle: the artifact filename is its own digest, and `shasum -c` passes.
