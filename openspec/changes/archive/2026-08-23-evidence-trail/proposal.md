# Evidence Trail

## Why

The canvas shows a graph and cannot say where any of it came from. Selecting a node reveals its identifiers and its temporal extent — but not the step that derived it, and not the evidence that step was attributed to. The graph is a picture rather than a route into the record.

Underneath it is a plainer gap: **evidence is write-only from every front-end.** `Engine` exposes `ingest` and nothing that reads back, so although the store keeps every artifact content-addressed and write-once, no agent, command, or browser can retrieve one. The invariant the whole system is built around — that nothing enters the graph without a step referencing evidence (I2) — is currently unverifiable from outside the engine.

## What Changes

- **Evidence can be read back** through the operation table: fetch a record by id, with its acquisition path, content type, and timestamps. Every front-end gets it, so the trail is not a console feature.
- **Content is returned only when asked for.** Metadata by default; the artifact's bytes on request, base64-encoded. An evidence artifact can be large, and a trail view wants the record far more often than the payload.
- **Selecting a node in the canvas shows its provenance** — the steps that produced it, what each step did, and the evidence each was attributed to, with the acquisition path that says whether it was fetched live, served from cache, proxied, or retrieved by a person.
- **The trail is reachable from evidence to artifact**: an investigator can go from a node to the bytes that justify it.

Not in this change: an exportable evidentiary bundle (TDR-010's decision, still `proposed`), redaction of sensitive artifacts (P4 governance), and provenance for relations and events — entities first, because that is what the canvas selects.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `engine-runtime`: the engine can read evidence back, not only write it.
- `agent-integration`: evidence retrieval joins the operations, so every front-end can follow a trail.
- `console`: selecting a node in the canvas shows the steps and evidence behind it.

## Impact

- `packages/schema`: nothing new — `EvidenceStore.get` already exists; it simply has no route out.
- `packages/engine`: `Engine` gains evidence retrieval.
- `packages/agent`: an `evidence_get` operation, returning metadata always and content on request.
- `apps/console`: the canvas's selection panel gains the steps that produced the entity and the evidence behind them, with a content preview for textual artifacts.
- Tests: evidence round-trips by id; an unknown id reads as absent; content is withheld unless requested; the steps shown for an entity are exactly those whose operation names it; provenance survives a replay.
