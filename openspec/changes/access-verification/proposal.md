# Access Verification

## Why

Every `access` classification in the system is an agent's guess from a landing page. 28 of the 47
curated candidates read `open_api` — the value most likely to be wrong, since a homepage that
advertises an API says nothing about whether the data behind it is API-exposed — and 37 of those
candidates have already been **promoted into packs** on that basis.

The classification is not decorative. `runnabilityOf` derives from it, `catalog_list` advertises on
it, the browser transport is selected by it, and acquisition now refuses on it. A deployment
currently tells an agent "this source is runnable" on the strength of something nobody checked.

Nothing in the system can check it. There is no way to ask "is this actually an API?" and get an
answer backed by anything. Track A's reclassification work would otherwise be a second round of
guessing by the same method that produced the first.

Two things make this the moment. The engine can now acquire five ways, so a probe can attempt the
path a classification claims and record what happened. And the browser transport landed, so the one
signal that actually separates a browser-only interface from a scrapable page — whether the content
requires JavaScript — is finally observable, by rendering the page and comparing it with the raw
response.

While scoping this, a defect: **the HTTP transport discards what it observed.** It hardcodes
`contentType: "application/octet-stream"` and drops the status code, so every HTTP-acquired artifact
in the evidence store records a placeholder for its type, and a `401` is indistinguishable from a
`200`. The probe cannot work without those signals, and the evidence record has been describing
artifacts wrongly regardless.

## What Changes

- **Transports stop discarding what they observed.** `TransportResult` carries the response's real
  content type and, where the transport has one, its status. Evidence therefore records what was
  actually acquired instead of a placeholder.
- **An access probe.** Given a registered source, the engine acquires it *through the source runtime*
  — never a raw fetch (I4) — and derives an observation from what came back: the content type,
  whether the body is machine-readable, whether the endpoint demanded a credential, and, where a
  browser is wired, whether the page's content depends on JavaScript.
- **The observation is evidence-backed.** It carries the ids of the artifacts it was derived from, so
  a classification can be re-derived or disputed against write-once, content-addressed bytes rather
  than taken on trust. This is the whole difference between a verified classification and a guess.
- **`verify_access` on the shared operation table**, so it lands on MCP, CLI, and HTTP identically
  (I8), and an agent can close the loop by passing the result to the catalog's existing `enrich`.
- **The probe says what it cannot conclude.** An inconclusive probe returns `unknown` with a reason
  rather than a confident guess — replacing one guess with another would be the failure mode here.

Not in this change: bulk re-verification of the 47 (that is the data work this makes possible),
writing verdicts back automatically, persisting observations, candidate-store integration, and any
robots/ToS policy about probing.

## Capabilities

### Modified Capabilities

- `source-runtime`: transports report the content type and status they observed; a source can be
  probed for what its access classification actually is.
- `evidence-store`: an artifact records the content type it was served as, not a placeholder.
- `agent-integration`: both front-ends can verify a source's access classification.

## Impact

- `packages/schema`: `TransportResult` gains `status`; a new `AccessObservation` schema (it crosses a
  front-end boundary, so it is schema-encoded and decoded like everything else, I6).
- `packages/sources`: the HTTP transport carries the response's content type and status; dataset and
  browser report the types they already know.
- `packages/engine`: a new access probe deriving an observation from acquisitions; evidence records
  the real content type as a consequence.
- `packages/agent`: `verify_access` on the operation table.
- Tests: the classification rules per signal set, an inconclusive probe, the probe refusing to bypass
  the runtime, evidence carrying the real content type, and parity across both front-ends (I8).
- No TDR required: no new store, transport, serialization, or UI dependency — the probe is a
  derivation over acquisitions the runtime already performs.
