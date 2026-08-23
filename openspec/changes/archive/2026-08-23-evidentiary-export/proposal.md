# Evidentiary Export

## Why

Everything an investigation needs to be *defensible* now exists inside the tool — steps cite the transform and versioned source that produced them, evidence is content-addressed and retrievable, provenance resolves per subject, and replay folds the log deterministically. None of it survives contact with anyone who does not run the tool.

`03-system-architecture.md` §9 set the goal: "a serializable step log + evidence refs ⇒ portable evidentiary bundle for archive and legal handoff". That is the difference between a graph we believe and a claim someone else can check.

## What Changes

- **An investigation exports as a BagIt-shaped bundle** (TDR-010): artifacts as real files under `data/`, a `manifest-sha256.txt` any standard tool can verify, and a `viokit-manifest.json` carrying the graph, the full step log, and each step's attribution.
- **Integrity is attested with SHA-256 computed at export**, not with the internal evidence id. Evidence ids are 64-bit FNV-1a — a deduplication key with no collision resistance — and the manifest says so explicitly rather than letting a reader mistake an id for a cryptographic guarantee.
- **A bundle is replayable.** Its manifest carries the whole step log, so the graph can be rebuilt from the bundle alone and checked against what the bundle claims.
- **Export is an operation**, so every front-end can produce one.

Not in this change: signing (no identity model until governance), redaction (P4), selective export of part of an investigation, and changing evidence identity to a cryptographic digest — recorded as TDR-010's open question because it rewrites every stored id.

## Capabilities

### New Capabilities

- `evidentiary-export`: producing a portable bundle that a recipient can verify and replay without the tool that made it.

### Modified Capabilities

- `agent-integration`: exporting is available as an operation to every front-end.

## Impact

- `packages/engine`: bundle assembly — manifest, digests, artifact files.
- `packages/agent`: an `export_bundle` operation.
- Tests: every step in the log appears in the manifest; every referenced artifact is present as a file; digests match the bytes; the graph rebuilt from the bundle equals the graph exported; a missing artifact is reported rather than silently omitted.
- Docs: how to verify a bundle with standard tools, and what the bundle does and does not prove.
