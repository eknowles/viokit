## Context

See `proposal.md` — Why. What the implementation works with:

- `EvidenceStore` already has `get(id)` returning `Option<Evidence>`; `Engine` simply never exposed it. There is no new storage concern here, only a route out.
- An `Evidence` record carries `id` (the content hash), `acquisitionPath`, `contentType`, `acquiredAt`, `observedAt`, and `bytes`.
- `Step` carries `evidenceIds` and an `operation`; `AddEntity` names the entity. So "which steps produced this entity" is answerable from the log alone — no index, no new state.
- `Engine.log` already returns every step, and the console already calls it.

## Goals / Non-Goals

**Goals:**
- Make the trail followable end to end: node → step → evidence → artifact.
- Keep large artifacts from travelling when only the record is wanted.
- Answer provenance from the log rather than by building an index that could disagree with it.

**Non-Goals:**
- No evidentiary bundle export (TDR-010), no redaction (P4), no provenance for relations or events yet.
- No search over evidence; retrieval is by identifier.

## Decisions

1. **Provenance is derived from the step log, not indexed.**
   The console asks for the log and filters it for steps naming the selected entity. An index would be faster and could drift from the log, and the log is the system of record (I3) — a trail that disagrees with it would be worse than a slow one. If the log ever grows past what this can scan, the fix is a query on the engine side, still derived from the log.

2. **Content is opt-in, and travels as base64.**
   `evidence_get` returns the record without bytes unless `includeContent` is set. Artifacts can be large, a trail view usually wants the record, and a JSON-encoded `Uint8Array` is an index-keyed object that will not decode back — the same boundary fact the `ingest` operation already deals with, handled the same way.

3. **Absence is not an error.**
   An unknown evidence id reads as `None`, matching the store's own signature and the treatment view state already gets. A caller following a trail into a gap should see a gap, not an exception.

4. **The panel shows the acquisition path in words.**
   `live`, `cache`, `proxy`, and `manual` are the difference between "we fetched this" and "someone typed this in", which is the single most important thing an investigator can know about an artifact. The manual path also names its retriever, and that is shown.

5. **Only entity provenance for now.**
   The canvas selects nodes, so entities are what an investigator asks about. Relations and events are the same shape of question and can follow once there is a way to select them.

## Risks / Trade-offs

- **[Scanning the whole log per selection]** → **Mitigation**: accepted (decision 1); investigation logs are small, and the alternative risks a trail that disagrees with the record. An engine-side query is the escalation if it bites.
- **[Base64 inflates content ~33%]** → **Mitigation**: which is exactly why content is opt-in; the default path carries none of it.
- **[A textual preview could render hostile content]** → **Mitigation**: the preview is inserted as text, never as markup, so a captured page cannot execute in the console.
- **[Showing evidence bytes in a UI is a governance question]** → **Mitigation**: real, and unaddressed here by design — the surface is loopback-only and unauthenticated until P4, which the README already states.

## Migration Plan

Purely additive: a new engine method, a new operation, a richer selection panel. Nothing changes shape.

## Open Questions

- Whether provenance should show the *transform* that ran, not only the step. The step records what was done; naming the transform means recording it on the step, which is a schema change and its own decision.
