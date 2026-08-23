# TDR-026 — Signing an evidentiary bundle

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** TDR-010 (the bundle format), TDR-021 (evidence identity is a SHA-256 digest), TDR-023 (identity — the principal a signature attributes to, and the `acquiredBy` custody claim this makes provable), TDR-024 (redaction — the withheld list is part of what must be signed), TDR-018 (secret provisioning — a signing key is a secret); invariants I1, I9; `CONTRACT.md` capability `governance`

## Decision summary
> Sign with **Ed25519 from the Node standard library** — no dependency — over a BagIt **`tagmanifest-sha256.txt`**, so the signature transitively covers the artifacts *and* the trail. The signing key is a `SecretProvider` reference (TDR-018), never a literal. A recipient verifies with stock `openssl` and none of our software; an unsigned bundle says it is unsigned rather than being silently unsigned.

## Context

The bundle already attests that its artifacts are as they were at export: each artifact's id *is* the
SHA-256 of its bytes (TDR-021), and `manifest-sha256.txt` records the same digests in BagIt form. What
it cannot do is say *who* asserts that. The manifest itself admits it: custody is "an unsigned
assertion by the exporting deployment, not a cryptographic proof".

TDR-023 gave artifacts an `acquiredBy` and TDR-024 gave the bundle a withheld list. Both are claims a
recipient is being asked to take on trust from a JSON file that anyone could edit.

**A gap found while reading the export for this decision, and it is the shape of the whole problem:**
`manifest-sha256.txt` covers `data/` only. `viokit-manifest.json` — the steps, the claims, the graph
state, the custody records, and the list of what was withheld — **is covered by no digest at all**.
Today, before any signing, the trail can be altered and nothing in the bundle detects it. Signing the
payload manifest alone would have looked like a fix and left that exactly as it is.

Constraints:
- **A recipient must be able to verify without running our software.** That is TDR-010's whole point;
  a signature only ours can check would be a downgrade dressed as an upgrade.
- No new dependency if avoidable — this is a local-first, embedded system.
- A signing key is a secret, and TDR-018 already decided that secrets are referenced, never written
  into anything tracked.
- An unsigned bundle must be *visibly* unsigned. Silence would be the worst outcome: a recipient who
  assumes a signature that is absent.

## Spike evidence

Run 2026-08-23, Node stdlib + OpenSSL 3.6.2.

| Question | Result |
|---|---|
| Can Node sign Ed25519 with no dependency? | **Yes** — `generateKeyPairSync("ed25519")`, `sign(null, …)`; 64-byte detached signature |
| Can stock `openssl` verify it? | **Yes** — `openssl pkeyutl -verify -pubin -inkey key.pub.pem -rawin -in <file> -sigfile <sig>` → `Signature Verified Successfully` |
| Does it detect tampering? | **Yes** — one altered line → `Signature Verification Failure`, exit 1 |

So the "recipient runs none of our software" property survives signing, which is the thing that had
to be established before choosing anything.

## Options considered

### Algorithm

#### Option A — Ed25519 from the Node standard library
- **Pros:** No dependency. No parameter choices to get wrong (no curve, no padding, no hash
  selection). 64-byte signatures, 32-byte keys. Verifiable by stock OpenSSL, as measured. Modern
  default in every comparable format.
- **Cons:** Not FIPS-approved in some older regimes, which could matter to a government recipient.

#### Option B — ECDSA P-256
- **Pros:** The widest institutional acceptance, FIPS-approved.
- **Cons:** Parameterised, and the parameters are how ECDSA gets implemented wrongly; signatures are
  malleable and nonce-dependent. Also in the stdlib, so it buys nothing except acceptance.

#### Option C — RSA-PSS
- **Pros:** Universally accepted, oldest tooling support.
- **Cons:** Large keys and signatures, slower, and more knobs. Nothing here needs it.

#### Option D — Detached OpenPGP signature
- **Pros:** Matches how evidence and releases are often signed; existing web of trust.
- **Cons:** A real dependency and a large format. Its value is key distribution and trust, which is
  the part this decision explicitly does *not* solve either way.

### What is signed

#### Option E — Sign `manifest-sha256.txt`
- **Pros:** Simple; covers every artifact transitively, since it holds their digests.
- **Cons:** **Leaves `viokit-manifest.json` unsigned** — the steps, custody, and withheld list. That is
  most of what a recipient is being asked to believe.

#### Option F — Sign a BagIt `tagmanifest-sha256.txt`
- **Description:** Emit the BagIt tag manifest, digesting `bagit.txt`, `manifest-sha256.txt`, and
  `viokit-manifest.json`; sign that one small file.
- **Pros:** Transitively covers everything — artifacts through the payload manifest, trail through the
  tag manifest. It is BagIt's own answer to this exact question, so existing tooling already
  understands the file, and it closes the unsigned-trail gap whether or not anyone signs.
- **Cons:** One more file. None of consequence.

#### Option G — Sign each artifact at acquisition
- **Pros:** The strongest custody claim: the bytes are attested when obtained, not when exported.
- **Cons:** Needs a key present during every acquisition and signs thousands of artifacts; and it
  attests to what the *deployment* saw, which is what `acquiredBy` already records. Worth revisiting
  when custody-at-acquisition is a stated requirement rather than an aspiration.

## Evaluation criteria
1. Can a recipient verify with software they already have? — non-negotiable (TDR-010)
2. Does the signature cover the trail, not just the bytes?
3. Dependencies added
4. Ways to hold it wrong
5. Institutional acceptance
6. Whether an unsigned bundle is visibly unsigned

## Analysis

- **Criterion 1 is satisfied by every algorithm here**, and was worth measuring rather than assuming —
  the spike is what makes this decision safe to take.
- **Criterion 2 eliminates E**, and E is the option one would otherwise reach for. Signing the payload
  manifest is the obvious move and it would have left the steps, the custody records, and the withheld
  list outside the signature. F is both the fix and the standard's own answer.
- **Criteria 3 and 4 favour A decisively.** Ed25519 has no parameters to choose, which is the failure
  mode ECDSA is known for, and it costs nothing to add. D's dependency buys trust distribution this
  decision is not attempting.
- **Criterion 5 is B's and D's only real argument.** It is a fair one for a government recipient, and
  the mitigation is that the scheme is named in the manifest, so a deployment that needs P-256 is a
  backend swap rather than a format change.
- **Criterion 6 is independent of the choice and easy to get wrong by omission.** The manifest must
  state the signing status either way; a recipient assuming a signature that is not there is worse
  than an unsigned bundle honestly labelled.

## Recommendation

- **Option A + F.** Ed25519 over a BagIt `tagmanifest-sha256.txt`.
  - The tag manifest is emitted **always**, signed or not: it closes the unsigned-trail gap on its own.
  - The signature is detached, raw 64 bytes, at `tagmanifest-sha256.txt.sig`.
  - The **public key travels in the bundle** for convenience, and the manifest says plainly that
    trusting it requires obtaining the key out of band — a bundle carrying its own key proves internal
    consistency, not authenticity. The key fingerprint is recorded so a recipient can compare against a
    key they already hold.
  - **The private key is a `SecretProvider` reference** (TDR-018), never a literal, so it cannot be
    written into anything tracked.
  - **No key configured means an unsigned bundle that says so**, in the manifest, in the same place the
    integrity note lives.
  - Verification instructions ship in the manifest, as a command a recipient can paste.

- **What would change this decision:** a recipient requiring FIPS-approved algorithms (swap to P-256
  behind the same shape); or custody-at-acquisition becoming a real requirement, which is G and a
  larger piece of work.

## Post-implementation finding (2026-08-23) — the signer was wired as a sibling

Every bundle came out unsigned while a key was configured. `BundleSignerLayer` resolves its key
through `SecretProvider` from its *own* construction context, and it had been merged beside that layer
rather than provided to it — so the signer saw no secret store, found no key, and honestly reported
`signed: false`.

**This is the third time this exact wiring mistake has appeared**: the browser engine beside the
dispatch transport, and now the signer beside the secret store. The shape is a layer that reads an
optional service from its own context, composed as a sibling; nothing fails, the capability just
silently is not there. Worth a habit: when a layer uses `Effect.serviceOption`, check what provides it.

## Open questions
- **Key distribution and trust.** Deliberately out of scope: this makes a bundle tamper-evident and
  attributable *to a key*, and says nothing about whose key it is. Anything more is a PKI.
- **Key rotation**, and whether an old bundle should remain verifiable after a key is retired — it
  will, but nothing records which key was current when.
- Whether the signature should cover the *investigation* identity too, so a bundle cannot be presented
  as a different case's.
- Whether a countersignature by a second principal is worth having for high-stakes exports, which is
  cheap to add and hard to remove.

## References
- Spike 2026-08-23: Node `crypto` Ed25519 → verified by OpenSSL 3.6.2, tampering detected
- TDR-010 (bundle format and the no-our-software property), TDR-021 (digest identity)
- TDR-018 (secret provisioning — the seam the key uses)
- TDR-023 (`acquiredBy`), TDR-024 (the withheld list) — the two claims this makes tamper-evident
- BagIt (RFC 8493) §2.2.1 tag manifests
