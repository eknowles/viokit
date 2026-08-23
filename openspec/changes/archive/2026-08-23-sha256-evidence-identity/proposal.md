# SHA-256 Evidence Identity

## Why

`CONTRACT.md` I1 says "raw artifacts are write-once; content hash *is* identity", and the verification hint reads "hash computed at write; change = new artifact". The invariant is written as though the hash carries integrity weight. It does not: evidence ids are 64-bit **FNV-1a**, a hash-table function with no preimage or collision resistance. Producing two different artifacts sharing an id is cheap.

Building the evidentiary export made the cost concrete. The bundle had to attest with a separately computed SHA-256 and then explain, in its own manifest, that the evidence id proves nothing. That disclosure is honest and is an odd thing to have to write about a system whose purpose is defensible evidence.

TDR-021 settles it. This is also the cheapest moment the change will ever be: identity is derived from content, so it can never be migrated in place — only recomputed — and no deployment holds data worth recomputing.

## What Changes

- **Evidence identity becomes SHA-256** over the artifact's bytes. `shasum -a 256 <file>` now checks an artifact against its own id, with no tooling of ours.
- **The cache request fingerprint moves with it.** A fingerprint collision would serve bytes acquired from a *different source* while the evidence recorded `acquisitionPath: cache` — an integrity failure wearing a performance hat.
- **Identifiers that only name things stay on FNV-1a** — step ids, view-state paths, the discovery harness's candidate key — with comments saying why each is which. Using a cryptographic hash where no guarantee is being made would imply one.
- **The export bundle simplifies.** The manifest digest and the evidence id become the same string, so `data/<id>` is self-attesting and TDR-010's disclosure paragraph is deleted rather than maintained.
- **`CONTRACT.md` I1 is amended** to say the hash is cryptographic, so the invariant states what is enforced.

Not in this change: migrating existing stores (impossible in principle — ids are derived from content), Merkle-chunking large artifacts, and signing.

## Capabilities

### Modified Capabilities

- `core-schema`: evidence identity is a cryptographic digest of the artifact.
- `evidence-store`: an artifact's identifier can be verified against its bytes with standard tools.
- `evidentiary-export`: the bundle attests with the identifier itself rather than a parallel digest.

## Impact

- `packages/engine`: `sha256Hex` in `hash.ts`; both evidence stores and the cache fingerprint use it; `export.ts` stops computing a separate digest and stops disclaiming the id.
- **Breaking**: every previously stored evidence id changes, and so does every `evidenceIds` reference in a stored step log. Existing stores are incompatible; there is no migration and the change says so rather than pretending otherwise.
- Tests: an id equals the SHA-256 of its bytes; identical bytes still deduplicate; altered bytes yield a different id; a bundle's manifest digest equals the artifact's id; the cache fingerprint is a cryptographic digest.
- Docs: the export README's "what a bundle does not prove" section shrinks to what is still true.
