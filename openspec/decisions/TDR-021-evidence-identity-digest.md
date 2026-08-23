# TDR-021 — Evidence identity: cryptographic digest vs FNV-1a

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** TDR-010 (evidentiary export — raised this as its open question); TDR-007 (evidence store); `CONTRACT.md` I1 (evidence immutability, "content hash *is* identity"), I9 (cache transparency)

## Decision summary
> Evidence identity becomes **SHA-256** over the artifact's bytes, and the cache request fingerprint moves with it. Identifiers that merely name things rather than attest to content — step ids, view-state paths, candidate dedup keys — stay on FNV-1a, deliberately. There is no migration: identity is derived from content, so every stored id and every reference to one would have to be rewritten, and no deployment holds data worth rewriting.

## Context
- `CONTRACT.md` I1 states that "raw artifacts are write-once; content hash *is* identity", and the verification hint reads "hash computed at write; change = new artifact + supersede ref". The invariant is written as though the hash carries integrity weight.
- It does not. `fnv1aHex` is a 64-bit **FNV-1a** hash — a hash-table function with no preimage or collision resistance. Its docstring says "any byte change yields a different id", which is true of accidental corruption and false of anything deliberate. Producing two different artifacts with the same 64-bit FNV-1a id is cheap.
- This surfaced while building evidentiary export (TDR-010), which had to attest with a separately computed SHA-256 and state in its own manifest that the evidence id proves nothing. That is a workable disclosure and an odd thing to have to say about a system whose purpose is defensible evidence.
- Constraints: whatever replaces it must work in Bun and Node (TDR-001 keeps Node a drop-in), must be computable synchronously at write, and must not add a dependency if avoidable.
- Affects `packages/engine` (evidence stores, cache fingerprint) and every id already stored.

## Options considered

### Option A — SHA-256 for evidence identity and the cache fingerprint
- **Description:** `createHash("sha256")` from `node:crypto`, hex-encoded, as the evidence id. The cache request fingerprint moves too. Non-attesting identifiers stay FNV-1a.
- **Pros:** Universally available and universally verifiable — `shasum -a 256` on any machine checks an artifact against its id, with no tooling of ours. Already in the tree via `node:crypto`, used by export, works in Bun and Node. Collapses two concepts into one: the export manifest's digest and the evidence id become the same string, so `data/<id>` is self-attesting and the disclosure TDR-010 had to write disappears. Makes I1 mean what it says.
- **Cons:** 64 hex characters instead of 16, in filenames, JSON, and URLs. Slower than FNV-1a per byte, though negligible beside the network I/O that produced the bytes. Breaks every stored id.

### Option B — BLAKE3
- **Description:** A modern, very fast cryptographic hash.
- **Pros:** Substantially faster than SHA-256 on large inputs; strong.
- **Cons:** Needs a dependency, and the verification story is worse where it matters most: a recipient of a bundle has `shasum` and probably not a BLAKE3 tool. For evidence, ubiquity of verification beats throughput.

### Option C — Keep FNV-1a as identity; carry SHA-256 alongside
- **Description:** The status quo after TDR-010 — id for lookup, separate digest for attestation.
- **Pros:** No migration; nothing breaks; already implemented.
- **Cons:** Two identifiers for one artifact, and the one used everywhere is the one that proves nothing. Every consumer must be told which to trust, forever, and I1 continues to overstate itself. Correct-but-confusing, and the confusion sits exactly where the stakes are highest.

### Option D — Truncated SHA-256 (e.g. 128-bit)
- **Description:** Cryptographic, but shorter ids.
- **Pros:** Halves the length while keeping collision resistance well beyond need.
- **Cons:** Not directly checkable with standard tools — `shasum` prints the full digest, so a recipient comparing by eye or by script hits a mismatch. That defeats the main reason to change.

## Evaluation criteria
1. Can a recipient verify an artifact against its identifier with tools they already have?
2. Does it make I1 true as written?
3. Dependency and runtime portability
4. Cost of the change, including stored data
5. Simplicity of the resulting story

## Analysis
- **Criterion 1 decides between A, B, and D.** All three are cryptographically adequate; only SHA-256 is checkable by anyone with a shell. For a bundle meant for legal handoff, that is not a minor convenience — it is the property being bought.
- **Criterion 5 is what rules out C**, which is otherwise the cheapest option by a distance. Carrying two identifiers means every document, every API response, and every conversation has to distinguish the lookup key from the attestation. Collapsing them means `data/<id>` is self-attesting and TDR-010's disclosure paragraph can be deleted rather than maintained.
- **Criterion 4 is smaller than it looks.** Identity is derived from content, so there is no in-place migration in any option — an id cannot be "updated", only recomputed, which changes every step's `evidenceIds` too. That would be prohibitive with real data and is free without it. This is the cheapest moment this change will ever be.
- **The cache fingerprint travels with it** for a related reason: a fingerprint collision means serving cached bytes acquired from a *different source*, and the resulting evidence would record `acquisitionPath: cache` over content that never came from that source. That is an integrity failure wearing a performance hat, and it costs nothing to close.
- **Non-attesting identifiers deliberately stay on FNV-1a**: step ids, view-state file paths, and the discovery harness's candidate fingerprint name things rather than attest to their content. Using a cryptographic hash there would suggest a guarantee that is not being made, and consistency for its own sake is the wrong instinct when the whole point is that some hashes carry weight and others do not.

## Recommendation
- **Option A.** SHA-256 over the artifact bytes as the evidence id; SHA-256 for the cache request fingerprint; FNV-1a retained for step ids, view-state paths, and candidate fingerprints, with comments saying why each is which.
- **No migration.** Existing stores are incompatible and are documented as such. Any evidence worth keeping is re-ingested, which recomputes ids correctly.
- **Amend `CONTRACT.md` I1's verification hint** to say the hash is cryptographic, so the invariant states what is actually enforced.
- **What would change this decision:** SHA-256 becoming a performance problem on large artifacts (BLAKE3 returns, with a verification tool shipped alongside), or a recipient ecosystem standardising on something else.

## Open questions
- Whether artifacts should be chunked and Merkle-hashed so a large artifact can be partially verified. Not now: artifacts are page-sized, and it would complicate the identifier for no present benefit.

## References
- TDR-010 (raised this; its manifest disclosure is what this removes)
- `CONTRACT.md` I1, I9; `packages/engine/src/hash.ts`
- RFC 8493 (BagIt) — `manifest-sha256.txt` is the interoperability reason for SHA-256 specifically
