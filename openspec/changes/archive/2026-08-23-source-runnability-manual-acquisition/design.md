## Context

See `proposal.md` — Why. Four facts about the current code shape this design:

- **`SourceAccess` already exists**, in `packages/schema/src/catalog.ts`, as part of the discovery harness's candidate record (`open_api` / `dataset` / `browser_scrape` / `requires_key` / `unknown`). It is the right vocabulary; it simply stops at promotion.
- **`Transport` is `"http" | "dataset"`.** There is no browser transport and this change does not add one, so "can this deployment run this source" is a real question with a real answer today.
- **`AcquisitionPath` is a tagged union** of `live` / `cache` / `proxy`, each carrying an optional `ref`. Adding a variant is additive; existing records decode unchanged.
- **`Schema.Uint8Array` does not survive JSON.** Encoding gives an index-keyed object (`{"0":104,"1":105}`) that fails to decode back — verified. Binary crossing a front-end boundary needs an explicit codec.

Constraints: Effect 4.0.0-beta.103; decode at every boundary (I6); policy stays runtime-owned (I4/I10); evidence write-once and content-addressed (I1); every acquisition records its path (I9).

## Goals / Non-Goals

**Goals:**
- One access vocabulary, defined once, shared by candidates and specs.
- Runnability answered per deployment, not baked into a spec that travels between deployments.
- A source the engine cannot fetch is still *usable*, through evidence submitted from outside.

**Non-Goals (design-level, beyond the proposal's scope line):**
- No browser automation, session store, or anti-bot handling.
- No secret store or credential provisioning; a `requires_key` source is runnable only if its spec already carries auth.
- No change to how transforms consume evidence — manually acquired evidence is ordinary evidence.
- No attempt to re-classify the existing candidates; the classification the harness recorded is taken as given.

## Decisions

1. **`SourceAccess` moves into the core schema; `catalog.ts` imports it.**
   The classification is the same fact before and after promotion, so it should not be two types that drift. Alternative considered: duplicating the literal union onto `SourceSpec` (rejected — two vocabularies to keep in sync is exactly how the classification got lost in the first place).

2. **Runnability is derived at query time, never stored.**
   The same `SourceSpec` is runnable in a deployment with a browser sidecar and not in one without; a `requires_key` source is runnable once its spec carries auth. Storing a boolean would be a lie the moment the spec moved. The catalog and the source runtime both derive it from the same function, so the answer the catalog advertises is the answer acquisition gives.

3. **The deployment declares which transports it provides, via a `TransportCapabilities` service.**
   Derivation needs to know whether a browser transport exists, and today nothing states that — there is one `SourceTransportService` and no way to ask what it covers. A small service holding the set of available transport kinds (default: `http`, `dataset`) makes today's answer honest and makes adding a browser later a wiring change rather than a code change. Alternative considered: hardcoding "browser is never available" (rejected — it bakes in the thing we expect to change, and the refusal message would be a lie in a browser-equipped deployment).

4. **Refusal lives in the source runtime, before transport.**
   Runnability is acquisition policy, and policy is runtime-owned (I4/I10): a transform or front-end must not be the thing that decides to skip a source. Failing before any request also means a browser-only source produces an explanatory error rather than a 403 that looks like a bug.

5. **`Manual` records who, and optionally where.**
   `{ _tag: "manual", by, ref? }`, with `by` required — unlike `live`/`cache`/`proxy`, where the pipeline is implicitly the actor, a human act has an actor worth naming, and evidence that cannot say who obtained it is weak evidence. `ref` carries the origin (a URL, a case reference).

6. **Binary crosses the front-end boundary as base64, via `Schema.Uint8ArrayFromBase64`.**
   Forced by the encoding fact above, and it keeps the shared schema authoritative for the conversion rather than hand-rolling `atob` in an adapter.

7. **`ingest` joins the shared operation table**, so it lands on MCP and CLI together and the parity test keeps holding. It maps to `Engine.ingest`, which already exists and already content-addresses.

8. **Packs are regenerated with `access` as structured data.**
   Not optional housekeeping: `access` defaults to `unknown`, so without regeneration every promoted source would read as unclassified and the catalog's new runnability signal would be uniformly useless.

9. **`unknown` does not block acquisition.**
   An unclassified source is attempted and flagged, rather than refused. Refusing would punish missing metadata rather than a real constraint, and the harness records `unknown` freely.

## Risks / Trade-offs

- **[Runnability is only as good as the classification]** — an agent that recorded `open_api` for a site whose data is really behind a login produces a source that claims to be runnable and fails at acquisition → **Mitigation**: the failure is an ordinary transport error, exactly as today, so this is no worse than the status quo; the classification is a hint that improves, not a guarantee. Re-classification is explicitly out of scope.
- **[`TransportCapabilities` can disagree with the transport actually wired]** — a deployment could declare `browser` while providing an http-only transport → **Mitigation**: the default is derived from what the standard layers provide, and a mismatch produces a transport error at acquisition, the same failure as any misconfigured transport.
- **[Base64 inflates large artifacts ~33% over the boundary]** → **Mitigation**: acceptable for the manual case, which is human-scale (a page, a PDF, a screenshot); bulk ingestion has the filesystem evidence backend and does not need the front-end.
- **[Manual evidence is only as trustworthy as its submitter]** — `by` is self-asserted, not authenticated → **Mitigation**: recording it is still strictly better than the current inability to record anything; authentication is P4 governance, and the invariant it serves (I9, acquisition transparency) is about honesty of the record, not identity assurance.

## Migration Plan

Additive. `AcquisitionPath` gains a variant, so existing evidence decodes unchanged. `SourceSpec.access` defaults to `unknown`, so existing specs remain valid without edits — the packs are regenerated to make the signal useful, not to keep them working. `TransportCapabilities` has a default, so existing engine compositions need no new wiring. Rollback is removing the `access` field and the `manual` variant; no stored data depends on either.

## Open Questions

- Whether a future browser-equipped deployment declares `browser` through `TransportCapabilities` or through the transport layer itself advertising its kinds. Deferred: it changes no requirement here, and the answer belongs with the browser transport TDR.
