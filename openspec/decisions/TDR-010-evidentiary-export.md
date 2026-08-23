# TDR-010 — Evidentiary bundle export format

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** `CONTRACT.md` I1 (evidence immutability), I2 (provenance closure), I3 (replay), I7 (source versioning); TDR-005 (graph store, Arrow/Parquet output); TDR-007 (evidence store); `openspec/exploration/03-system-architecture.md` §9 ("a serializable step log + evidence refs ⇒ portable evidentiary bundle for archive and legal handoff")

## Decision summary
> Export a **BagIt-shaped directory**: evidence artifacts under `data/` named by their content id, a `manifest-sha256.txt` and `bagit.txt` that any off-the-shelf BagIt tool can verify, and a `viokit-manifest.json` carrying the claims, steps, and attribution that make the bag an *investigation* rather than a pile of files. Written by hand — BagIt is a text format, not a dependency.

## Context
- Everything a bundle needs now exists: steps cite the transform and versioned source that produced them (I7), evidence is retrievable by id, provenance resolves per subject, and replay folds the log deterministically (I3). Export is assembly, not new machinery.
- The purpose is stated in the architecture exploration: a portable bundle for **archive and legal handoff**. That sets the bar — a recipient with none of our software should be able to verify the artifacts and follow a claim to the bytes behind it.
- **A finding that shapes this decision:** evidence identity is `fnv1aHex`, a 64-bit **FNV-1a** hash. FNV-1a is a hash-table function with no preimage or collision resistance; the comment in `hash.ts` says "any byte change yields a different id", which is true of accidental corruption and false of deliberate forgery. Content addressing with FNV-1a gives deduplication and integrity against accident, **not** tamper-evidence. A bundle that attested only with those ids would overstate what it proves.
- Affects `packages/engine` (assembling a bundle), `packages/agent` (an operation), and nothing else.

## Options considered

### Option A — BagIt-shaped directory, SHA-256 manifest, plus our own claims manifest
- **Description:** `bagit.txt`, `manifest-sha256.txt`, `data/<evidence-id>` for artifacts, and `viokit-manifest.json` describing entities, relations, events, the step log, and each step's attribution.
- **Pros:** BagIt (RFC 8493) is the digital-preservation standard for exactly this — transferring a set of files with checksums so a recipient can verify integrity independently. Libraries and archives already have tools for it, so a recipient needs nothing of ours to check the artifacts are intact. It is a *text* format: four small files, no dependency. Our semantics live in a separate manifest, so the two concerns stay separable.
- **Cons:** Two manifests, which needs explaining. BagIt says nothing about what the files *mean*, so the interesting part is still ours and still bespoke.

### Option B — A single JSON file with base64 artifacts
- **Description:** One document containing the graph, the log, and every artifact inline.
- **Pros:** Trivial to produce and to move; one file, no layout to explain.
- **Cons:** Base64 inflates by a third and puts megabytes of captured pages inside a document meant to be read. No standard verification path — a recipient must trust or write code. Poor fit for a legal handoff, where a reviewer wants to open the artifact in its native viewer.

### Option C — Arrow/Parquet
- **Description:** Export the graph as columnar files, per TDR-005's Arrow/Parquet output.
- **Pros:** Excellent for analysis and for large graphs; already in the store's vocabulary.
- **Cons:** Optimised for querying, not for custody. A reviewer cannot read it without tooling, and it has no natural place for raw artifacts. Right answer for "give me this graph as data", wrong one for "prove how this claim was reached".

### Option D — RO-Crate
- **Description:** JSON-LD research-object packaging.
- **Pros:** Rich, linked-data provenance vocabulary; growing adoption in research.
- **Cons:** Its provenance model is about datasets and workflows, and mapping our steps and evidence onto it is interpretive work that could misstate what we mean. Heavier to produce and to read than the problem warrants today.

## Evaluation criteria
1. Can a recipient verify integrity with no software of ours?
2. Can a reviewer follow a claim to the artifact behind it, and open that artifact?
3. Honesty — does the bundle prove what it appears to prove?
4. Cost to produce, and dependencies added
5. Fit for archive and legal handoff specifically, not analysis

## Analysis
- **Criterion 1 is what separates A from everything else.** BagIt's whole purpose is independent verification, and it costs four text files. B, C, and D all require the recipient to take our word or write code.
- **Criterion 2 rules out C and weakens B.** A reviewer wants to open the captured page in a browser and the PDF in a reader; `data/` holds real files with real bytes. Base64 inside a JSON document does not.
- **Criterion 3 is where the FNV-1a finding bites**, and it applies to every option equally — so it is not a discriminator between them but a constraint on all of them. The bundle therefore attests with **SHA-256 computed at export time** over each artifact's bytes, recorded in `manifest-sha256.txt`, while our manifest records the FNV-1a id purely as the internal reference that links a step to a file. The bag proves integrity cryptographically; the id remains a lookup key and is described as such.
- **Criterion 4 favours A and B.** BagIt adds no dependency: `bagit.txt` is two lines and the manifest is `<digest>  <path>` per line. D would add real modelling work.
- **Criterion 5** is the tiebreak that makes this straightforward: the stated purpose is archive and legal handoff, and BagIt is the format archives already use.

## Recommendation
- **Option A.** A BagIt-shaped directory:
  - `bagit.txt` — version and encoding declaration.
  - `manifest-sha256.txt` — a SHA-256 digest per artifact, verifiable by standard tools.
  - `data/<evidence-id>` — the raw artifacts, one file each.
  - `viokit-manifest.json` — the investigation: entities, relations, events, every step with its evidence ids and its transform/source/version attribution, and the acquisition path of each artifact.
- **The bundle must be replayable.** A bundle whose manifest cannot reproduce the graph it claims to describe is not evidence, so producing one and folding its step log back into the same graph is the test that matters.
- **Bundles state what they do not prove.** The manifest records that evidence ids are FNV-1a lookup keys and that integrity is attested by the SHA-256 manifest, so nobody reads the id as a cryptographic guarantee.
- **What would change this decision:** a recipient ecosystem that speaks RO-Crate; a requirement to export graphs too large to hold as files, which is where Arrow returns; or signing requirements, which would sit on top of the bag rather than replace it.

## Open questions
- **Whether evidence identity should move to a cryptographic digest.** FNV-1a is adequate as a dedup key and inadequate as a tamper-evidence claim. Changing it rewrites every stored evidence id and every step's `evidenceIds`, so it needs its own decision and its own migration — but it should be made, and until it is, `hash.ts`'s claim that "any byte change yields a different id" should not be read as tamper-evidence.
- Signing bundles (who attests, with what key) — out of scope until there is an identity model, which is P4 governance.

## References
- RFC 8493 — The BagIt File Packaging Format
- `openspec/exploration/03-system-architecture.md` §9 (portable evidentiary bundle)
- `CONTRACT.md` I1, I2, I3, I7; `packages/engine/src/hash.ts` (the FNV-1a finding)
