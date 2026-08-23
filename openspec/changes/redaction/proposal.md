# Redaction

## Why

The roadmap's own words: sensitive *content* does not stay out of an export, and this is "needed
before a bundle leaves a machine". The bundle is this project's flagship artifact — scoped to a case,
carrying custody, verifiable by a recipient who runs none of our software. It was also all-or-nothing:
everything the case cited went.

So an investigator could not hand over a case containing one thing they must not disclose — a source's
identity, a bystander's details, material a court excluded — without handing over that thing too.

The hard part is that this system's foundations forbid the obvious fix. Evidence is write-once and its
id *is* the SHA-256 of its bytes (I1), so you cannot edit an artifact to remove a name without
changing what it is. The step log is append-only and replay is a fold over it (I3), so you cannot
delete a step to un-say something without every claim downstream losing its provenance.

## What Changes

- **A redaction is an append-only record** — artifact, case, ground, reason, principal, time. Nothing
  is edited and nothing is deleted (I1, I3).
- **An export names what it withheld.** The manifest carries each withheld artifact with its reason
  and who withheld it; the bytes do not travel. A bundle that quietly contains less than the case does
  is a misleading document, and this format exists to be trusted.
- **The steps that cite withheld material stay.** The claim still says what it rests on; what changed
  is that the bytes cannot be produced.
- **`redact` and `redactions` on the shared operation table**, so both front-ends have them (I8).
- **Redactions are durable**, one append-only file per investigation, kept apart from the evidence
  store and the step log — the same separation TDR-012 chose for view state.

Not in this change: destruction (TDR-024's Option D — designed, deliberately not built), retention
policy expression, cache eviction on redaction, and masking derived graph claims.

## Impact

- `packages/schema`: `Redaction`, `RedactionGround`, `Redacted`, and a store seam.
- `packages/engine`: a filesystem-backed redaction store; export consults and declares.
- `packages/agent`: `redact` and `redactions`.
- Tests: 7 new — the manifest declaring rather than dropping, history staying intact, and durability
  across store instances.
- TDR-024 is `decided`.

## Found by using it

- **The first store was in-memory**, and the CLI is process-per-command, so a redaction recorded by one
  invocation was gone by the next and the export happily carried material somebody had withheld. A
  governance mechanism that forgets is worse than not having one, because it is believed. Filesystem-
  backed now, and pinned by tests that read back through a separate store instance.

## What this does not do

The bytes are still on the machine. That is correct for redaction — "must not leave" — and it is
**not** retention, which sometimes means "must not be kept". TDR-024 designs destruction as an
explicit, tombstoned escalation and this change deliberately stops short of it: it is irreversible,
and because evidence is shared across cases, destroying an artifact one case is finished with can gut
another that still cites it.
