## Context

See `proposal.md` and TDR-010. What the implementation has to work with:

- `Engine.log` returns every step; `Engine.replay` folds them; `Engine.evidence(id)` retrieves an artifact. Export is assembly over three things that already exist.
- Steps carry `evidenceIds` and, where an acquisition produced them, `transformId`/`sourceId`/`sourceVersion`.
- Evidence identity is `fnv1aHex` — 64-bit FNV-1a, no collision resistance (TDR-010's finding).
- Bun exposes `Bun.CryptoHasher("sha256")`, so a cryptographic digest costs nothing.

## Goals / Non-Goals

**Goals:**
- A bundle a stranger can verify with standard tools and rebuild without our software.
- A bundle that is honest about the strength of its own claims.
- Assembly only — no new storage, no new invariants.

**Non-Goals:**
- No signing, no redaction, no partial export, no changing evidence identity.
- No compression: a directory is easier to inspect, and archiving it is the caller's choice.

## Decisions

1. **The bundle is a directory, not an archive.**
   Zipping is trivial for a caller and irreversible for an inspector. A directory can be listed, diffed, and opened file by file — which is what a reviewer actually does. BagIt is defined over a directory anyway.

2. **Two manifests, deliberately.**
   `manifest-sha256.txt` is BagIt's, and its whole value is that it is *not ours* — a recipient verifies with any BagIt tool. `viokit-manifest.json` carries meaning BagIt has no vocabulary for. Merging them would sacrifice independent verification to avoid explaining two files.

3. **Digests are computed at export from the bytes, never copied from the store.**
   A digest recorded from an artifact's stored metadata would attest to what we believe rather than what is in the file. Reading the bytes and hashing them is the only version of this that means anything.

4. **The manifest states the identifier's weakness in the manifest itself**, not only in documentation. A bundle travels away from its documentation; whatever it claims must travel with it.

5. **A missing artifact is recorded, not skipped.**
   If the store cannot produce something a step references, the bundle records the omission. A bundle that silently drops an artifact looks complete and is not, which is the failure mode that matters most for evidence.

6. **Replayability is verified in tests by folding the bundle's own log**, using the same fold the graph store uses. A bundle that cannot reproduce the graph it records is not evidence, so this is the test that gives the format its meaning.

## Risks / Trade-offs

- **[Two manifests need explaining]** → **Mitigation**: the `viokit-manifest.json` says what each file is for, and the README documents verification in three lines.
- **[A large investigation makes a large directory]** → **Mitigation**: correct behaviour — the artifacts are the evidence. Compression is the caller's to apply.
- **[SHA-256 attests the export, not the acquisition]** — an artifact tampered with *before* export exports faithfully → **Mitigation**: unavoidable at this layer and worth stating; end-to-end custody needs signing at acquisition, which needs an identity model (P4).
- **[FNV-1a ids remain the internal link]** → **Mitigation**: the honest reading is that ids locate files and SHA-256 attests them; the manifest says exactly that, and TDR-010 records the deeper fix as an open question.

## Migration Plan

Purely additive: a new engine method, a new operation, no schema change.

## Open Questions

None blocking; TDR-010 holds the open question about evidence identity.
