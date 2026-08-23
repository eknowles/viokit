# Source Runnability + Manual Acquisition

## Why

Most of the OSINT landscape is not an API. In the current candidate store, 10 of 47 curated sources (`browser_scrape` or `requires_key`) cannot be acquired by anything the engine can do — and that undercounts, because an agent classifying a source from its homepage records `open_api` when only a fraction of the data is actually API-exposed. Against the wider Bellingcat-style landscape the ratio inverts: login-walled and manual/web-only tools dominate.

Two consequences today:

- **The catalog overstates what a deployment can do.** The `access` classification the discovery harness produces does not survive promotion into `SourceSpec`, so `catalog_list` advertises browser-only and key-gated sources identically to runnable ones. An agent discovers a capability, invokes it, and gets a transport error that says nothing about why.
- **There is no way to use a source the engine cannot fetch.** A human (or an agent driving a browser interactively) can retrieve from a login-walled source, but the engine has no acquisition path for a human act and the agent surface exposes no way to submit the result. The evidence store is content-addressed, write-once, and provenance-carrying — it is already the right home for those bytes; nothing can put them there.

Fixing both is cheap and unblocks the long tail now, without committing to a browser fleet. The browser transport remains a separate, TDR-gated decision (TDR-011 gates it; roadmap P1 anticipated it) whose real cost is operational and legal, not schematic.

## What Changes

- **Access classification becomes first-class on `SourceSpec`.** The `SourceAccess` vocabulary the harness already uses (`open_api`, `dataset`, `browser_scrape`, `requires_key`, `unknown`) moves into the core schema and is carried by every source, so a promotion no longer discards it.
- **The catalog reports runnability, not just registration.** Each source entry states whether this deployment can actually acquire it and, when it cannot, why (no browser transport; credentials not configured; unclassified). Listings filter on it.
- **Acquiring a source this deployment cannot run fails with a typed, explanatory error** instead of a transport failure.
- **A `manual` acquisition path.** Evidence may record that a person retrieved it, carrying who and from where, alongside `live`/`cache`/`proxy` (I9).
- **`ingest` on both front-ends.** An agent or human can submit manually-acquired bytes as evidence through the same service the rest of the operations use (I8), decoded at the boundary (I6) and content-addressed on the way in (I1).
- **Promoted packs regain their access classification** as structured data rather than the doc comments they currently carry.

Not in this change: the browser transport, session/identity binding, and secret provisioning for `requires_key` sources. Those stay gated on TDR-011 (browser) and P4 governance (secrets); this change makes the deployment honest about needing them.

## Capabilities

### New Capabilities

None — this extends existing capabilities.

### Modified Capabilities

- `core-schema`: adds `manual` to the recorded `AcquisitionPath` variants, and carries the source access classification.
- `source-runtime`: a source spec carries its access classification; acquiring a source the deployment cannot run fails with a typed error rather than being attempted.
- `agent-integration`: catalog entries report runnability and filter on it; both front-ends expose evidence ingestion.
- `evidence-store`: manually acquired evidence is stored and preserved like any other, with its human provenance intact.

## Impact

- `packages/schema`: `SourceAccess` moves from `catalog.ts` into the core schema (one definition shared by candidates and specs); `SourceSpec` gains `access`; `Manual` joins the `AcquisitionPath` union with the retriever and origin recorded; new `SourceNotRunnable` error; catalog entry types gain runnability.
- `packages/engine`: the catalog derives runnability from access, transport availability, and configured auth; the source runtime rejects a non-runnable acquisition before attempting transport.
- `packages/agent`: an `ingest` operation on the shared table, so it appears on MCP and CLI identically; binary payloads cross the boundary as base64.
- `packs/*`: regenerated with `access` as structured data.
- Tests: runnability derivation per access kind, non-runnable acquisition rejected, manual evidence round-trips with provenance intact, `ingest` over both front-ends, filters, and the invariants I1/I6/I8/I9.
- No TDR required: no new store, transport, serialization, or UI dependency — the browser transport this change deliberately does *not* add is what TDR-011 gates.
