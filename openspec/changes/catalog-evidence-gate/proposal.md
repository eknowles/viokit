# The Catalog Requires Evidence

## Why

The source catalog is the one place in this system where an unattributed assertion could enter, and
37 of them were promoted into shipped pack files where they then read as facts.

The database is unambiguous about what the catalog actually holds:

| Field | Value |
|---|---|
| `discovered_by` | `mine:awesome-osint` — all 47 |
| `origin` | `NULL` — all 47 |
| `notes` | `[]` — all 47 |
| Work queue | 140 units, 1 ever claimed |

The discovery harness never ran. All 47 candidates are a single bulk import of an awesome-list, and
`origin` — the field designed to record where a candidate came from — is empty for every one, so
there is not even a link back to the list row. The descriptions ("authoritative registry of malware
families", "open threat intelligence exchange aggregating indicators, pulses") are prose written by
the importing pass, and `access` and `transport` were assigned in the same breath. Nothing was
fetched and nothing was checked.

This is why the verification sweep could conclude almost nothing: the URLs are homepages because a
homepage is all an awesome-list row gives you. Fixing the URLs would have been polishing guesses.

Everywhere else this framework insists on provenance — evidence is content-addressed and write-once
(I1), nothing enters the graph without a step citing evidence (I2), and the export exists so a claim
can be traced to bytes. `promoteSource` checked only that a candidate had not already been promoted.

## What Changes

- **A candidate must say where it came from.** `origin` becomes required on submission: a lead nobody
  can trace back is not a lead.
- **Promotion requires a classification somebody checked.** `promoteSource` takes an
  `AccessObservation` — which `verify_access` produces — and refuses one that concluded nothing, names
  no evidence, or belongs to a different source.
- **A promoted spec carries the artifacts it was classified from.** `SourceSpec.accessEvidence` holds
  the evidence ids, so a shipped pack file says which of its sources were checked and against what.
- **The catalog reports which classifications are unverified**, so a source nobody checked stops
  looking like one that was. All 38 currently registered sources report `accessVerified: false` —
  which is the demotion, and it is accurate.
- **A candidate can record what a probe observed**, so verification survives on the working record and
  not only in the promotion.

Not in this change: deleting anything. The 47 candidates and the 38 shipped sources stay exactly
where they are; they simply stop claiming an authority they never had. Re-verifying them needs
endpoints, which is `spec-endpoints`.

## Capabilities

### Modified Capabilities

- `source-catalog`: submission requires provenance; promotion requires a verified classification and
  records the evidence behind it.
- `agent-integration`: catalog entries report whether a source's classification was checked.

## Impact

- `packages/schema`: `origin` required on `SourceCandidateInput`; `verification` on `SourceCandidate`;
  `accessEvidence` on `SourceSpec`; `accessVerified` on `CatalogEntry`.
- `packages/source-catalog`: an `Unverified` failure; the promotion gate; both front-ends take the
  verification.
- `packages/engine`: the catalog derives `accessVerified` from the spec.
- Tests: the gate's three refusals, the evidence written into a promoted spec, submission without
  provenance refused, and the catalog reporting every current source as unverified.
- No TDR required.

## What this does not fix

The 38 shipped sources are now honestly labelled and still unevidenced. They cannot be verified until
their specs address an endpoint rather than a homepage — 31 of 38 are bare hosts. The gate stops the
catalog getting worse; `spec-endpoints` is what makes it better.
