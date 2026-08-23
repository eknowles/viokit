# Tasks — Source Runnability + Manual Acquisition

> No TDR gate: no new store, transport, serialization, or UI dependency. The browser transport this
> change deliberately does not add is what TDR-011 gates.
> Verification: per-package `typecheck`, package tests, `npm exec -- ultracite check`.

## 1. Schema: access, manual acquisition, errors

- [x] 1.1 Move `SourceAccess` from `catalog.ts` into the core schema; have `catalog.ts` import it so candidates and specs share one definition.
- [x] 1.2 Add `access` to `SourceSpec`, defaulting to `unknown`.
- [x] 1.3 Add a `Manual` variant to `AcquisitionPath` with a required retriever and an optional origin.
- [x] 1.4 Add a `SourceNotRunnable` typed error carrying the reason.
- [x] 1.5 Boundary tests: a manual path without a retriever is rejected; a source with no access reads as `unknown`; existing three-variant evidence still decodes (I6).

## 2. Runnability derivation

- [x] 2.1 Add a `TransportCapabilities` service holding the transport kinds a deployment provides, defaulting to `http` and `dataset`.
- [x] 2.2 Write the single derivation used by both the catalog and the runtime: browser-only without a browser transport → not runnable; `requires_key` without auth on the spec → not runnable; `unknown` → runnable but flagged; otherwise runnable.
- [x] 2.3 Tests: one case per access kind, plus `requires_key` with auth present and a browser-only source in a browser-declaring deployment.

## 3. Source runtime refuses what it cannot run

- [x] 3.1 Check runnability in `SourceRuntime.run` before any transport call; fail with `SourceNotRunnable` naming the reason.
- [x] 3.2 Tests: a browser-only source fails with its reason and issues no transport call (assert via a transport that records invocations); a credential-gated source without auth fails; the same source with auth proceeds; a runnable source is unaffected.

## 4. Catalog reports runnability

- [x] 4.1 Carry runnability and its reason on source catalog entries.
- [x] 4.2 Add a runnable filter to `CatalogFilter`; unfiltered listings keep returning everything, each entry carrying its status.
- [x] 4.3 Tests: an unusable source is marked and explained; a runnable-only listing narrows; an unfiltered listing still reports registration in full.

## 5. `ingest` on both front-ends

- [x] 5.1 Add `ingest` to the shared operation table: base64 content via `Schema.Uint8ArrayFromBase64`, content type, retriever, optional origin; builds the evidence input and delegates to `Engine.ingest`.
- [x] 5.2 Tests: manually retrieved bytes become content-addressed evidence with provenance intact; a submission missing its retriever is rejected and stores nothing; identical bytes submitted twice collapse to one record (I1); a step attributed to submitted evidence commits (I2); the parity test still passes with the new operation.

## 6. Packs

- [x] 6.1 Regenerate all promoted pack files with `access` as structured data rather than doc comments, preserving the harness's classification.
- [x] 6.2 Make the promoter carry `access` through promotion so the classification stops being discarded.
- [x] 6.3 Test: the `web-dns` pack registers, and the catalog reports its browser-only and key-gated sources as not runnable with reasons.

## 7. Verification and close-out

- [x] 7.1 Per-package typechecks; every suite green.
- [x] 7.2 `npm exec -- ultracite check` clean.
- [x] 7.3 End-to-end proof: an agent lists runnable sources, finds a browser-only source excluded, submits manually acquired bytes for it through `ingest`, commits a step attributed to that evidence, and reads it back.
- [x] 7.4 Invariant checklist (`CONTRACT.md` I1–I12), with I1, I6, I8, and I9 called out explicitly.
