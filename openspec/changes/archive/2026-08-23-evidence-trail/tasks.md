# Tasks — Evidence Trail

> No TDR: no new dependency, store, or transport. `EvidenceStore.get` already exists.

## 1. Engine

- [x] 1.1 `Engine` gains evidence retrieval by id, reporting absence for an unknown id.
- [x] 1.2 Tests: a stored artifact round-trips; an unknown id is absent; reading appends no step and writes no evidence.

## 2. Operation

- [x] 2.1 `evidence_get`, returning the record without bytes by default and with base64 content when requested.
- [x] 2.2 Tests: metadata-only by default; content on request decodes back to the original bytes; unknown id is absent; the operation appears on every front-end.

## 3. Console

- [x] 3.1 Derive an entity's steps from the log; show what each did and the evidence it was attributed to.
- [x] 3.2 Show each artifact's acquisition path in words, naming the retriever for a manual one.
- [x] 3.3 A textual artifact can be previewed; the preview is inserted as text, never as markup.
- [x] 3.4 A node with no steps found says so rather than implying a complete trail.
- [x] 3.5 Tests: step selection picks exactly the steps naming the entity; an entity with no steps is reported; acquisition paths render.

## 4. Verification

- [x] 4.1 Typechecks, suites, lint clean via devbox.
- [x] 4.2 Drive it live: run a transform, commit, select the node, and read through to the artifact.
- [x] 4.3 Invariant checklist, with I2, I3, and I8 called out.
