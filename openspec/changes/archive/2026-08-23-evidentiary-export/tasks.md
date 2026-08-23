# Tasks — Evidentiary Export

> Prereq: TDR-010 `decided`. Assembly over `log`, `replay`, and `evidence`; no new storage.

## 1. Bundle assembly

- [x] 1.1 Assemble a bundle from the graph, the step log, and the referenced artifacts.
- [x] 1.2 Write `data/<evidence-id>` per artifact; record artifacts the store cannot produce as missing.
- [x] 1.3 Compute SHA-256 per artifact from its bytes and write `manifest-sha256.txt`.
- [x] 1.4 Write `bagit.txt`.
- [x] 1.5 Write `viokit-manifest.json`: graph, full step log with attribution, evidence metadata, and a statement of what attests integrity and what does not.

## 2. Engine and operation

- [x] 2.1 `Engine` gains export.
- [x] 2.2 An `export_bundle` operation, available on every front-end.
- [x] 2.3 Test: exporting appends no step and writes no evidence.

## 3. Tests

- [x] 3.1 Every step in the log appears in the manifest, with its evidence ids and attribution.
- [x] 3.2 Every referenced artifact is present as a file.
- [x] 3.3 Recorded digests match the bytes; an altered artifact no longer matches.
- [x] 3.4 The graph folded from the bundle's log equals the graph the bundle records.
- [x] 3.5 A step referencing unavailable evidence yields a recorded omission, not a silent one.

## 4. Verification

- [x] 4.1 Typechecks, suites, lint clean via devbox.
- [x] 4.2 Export a real investigation and verify the bag with a standard tool, not ours.
- [x] 4.3 Document verification and what the bundle does and does not prove.
