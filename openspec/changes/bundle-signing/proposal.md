# Bundle Signing

## Why

The bundle could attest that its artifacts were as they were at export — each artifact's id *is* the
SHA-256 of its bytes. What it could not do is say *who* asserts that. The manifest admitted it in so
many words: custody was "an unsigned assertion by the exporting deployment, not a cryptographic
proof".

`acquisition-custody` gave artifacts an `acquiredBy` and `redaction` gave the bundle a withheld list.
Both are claims a recipient was being asked to take on trust from a JSON file anyone could edit.

**A gap found while reading the export for this change, and it reframed the whole thing:**
`manifest-sha256.txt` covers `data/` only. `viokit-manifest.json` — the steps, the claims, the graph
state, the custody records, and what was withheld — **was covered by no digest at all.** The trail
could be altered and nothing in the bundle detected it. Signing the payload manifest, which is the
obvious move, would have looked like a fix and left that exactly as it was.

## What Changes

- **A BagIt `tagmanifest-sha256.txt`**, digesting `bagit.txt`, `manifest-sha256.txt` and
  `viokit-manifest.json`. Emitted whether or not anything is signed, because the unsigned-trail gap
  exists independently of signing. It is BagIt's own answer to this question (RFC 8493 §2.2.1), so
  existing tooling already understands the file.
- **An Ed25519 signature over that tag manifest**, so it covers the artifacts *and* the trail
  transitively. Detached, 64 bytes, from the Node standard library — no dependency, and no parameters
  to get wrong.
- **The signing key is a `SecretProvider` reference** (TDR-018), never a literal.
- **An unsigned bundle declares itself unsigned**, in the manifest, with the reason. A recipient
  assuming a signature that is absent is worse than an unsigned bundle plainly labelled.
- **Verification instructions travel in the manifest** as a command a recipient can paste — stock
  `openssl`, none of our software, which is the property TDR-010 exists to protect.

Not in this change: key distribution or trust (that is a PKI, and the manifest says the bundle's own
key proves consistency and not authenticity), key rotation, countersignatures, and signing at
acquisition.

## Impact

- `packages/engine`: an Ed25519 signer behind a seam; the export emits the tag manifest and signs it.
- Tests: 8 new — the unsigned declaration, the tag manifest's coverage, the signature's shape, and
  three tamper cases, one of which shells out to `openssl` to check the third-party claim for real.
- TDR-026 is `decided`.

## Found by using it

- **Every bundle came out unsigned while a key was configured.** `BundleSignerLayer` resolves its key
  through `SecretProvider` from its own construction context, and it had been merged *beside* that
  layer rather than provided *to* it. Nothing failed; the capability just was not there, and the
  bundle honestly said `signed: false`.

  This is the **third** appearance of that exact wiring mistake — the browser engine beside the
  dispatch transport, and now the signer beside the secret store. When a layer reads an optional
  service from its own context, check what provides it.

## What this does not prove

The signature attests that this bundle is as the signing deployment produced it, and attributes it to
a key. It does not establish whose key that is — the public key travels for convenience and the
manifest says plainly that trusting it means obtaining the key separately. Nor does it prove custody
at the moment of acquisition: `acquiredBy` is the deployment's claim, now tamper-evident, not a
signature taken when the bytes were obtained.
