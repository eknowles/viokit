## Context

See `proposal.md` — Why. The relevant shapes:

- `Step` is `{ evidenceIds, id, operation }`. `SourceSpec` has no `version`.
- Steps are built in exactly two places: `transform.ts` (from an acquisition, where the spec and source are both in hand) and `correlate.ts` (from existing graph state, where there is no source at all).
- `CONTRACT.md` I7 asks for two things — steps citing source and version, and replay pinning versions. Only the first is actionable now: nothing re-runs a source during replay, so there is no resolution step to pin.

## Goals / Non-Goals

**Goals:**
- Make a claim traceable to what derived it and the state that thing was in.
- Record attribution where it is known and nothing where it is not.
- Close the actionable half of I7 and say plainly that the other half is not yet meaningful.

**Non-Goals:**
- No version negotiation, no fetching a source's current version, no comparison between versions.
- No re-running sources at replay, and therefore no pinning yet.
- No backfill: existing steps have no attribution and cannot acquire one honestly.

## Decisions

1. **Attribution is optional on `Step`, and that is a truthful shape rather than a convenience.**
   A `ResolveEntity` step produced by correlate derives from graph state, not from an acquisition. Requiring a source there would force an invented value, and an invented provenance is worse than an absent one. I7's "every Step records sourceId" is therefore met for every step where a source exists and deliberately not met where one does not — recorded here rather than glossed.

2. **`SourceSpec.version` defaults to an explicit "unversioned" marker, not to a number.**
   A default of `"1"` or `"latest"` would assert something untrue about a source nobody has versioned. An explicit marker means an unversioned source is visibly unversioned in the trail, which is a fact an investigator should see.

3. **The runner stamps attribution; the caller cannot supply it.**
   `TransformRunner.run` already holds the spec and the source, so attribution is derived rather than passed. A caller-supplied field could disagree with what actually ran, and provenance that can lie is not provenance.

4. **Version is copied onto the step, not referenced.**
   The step records the version string as it was at run time. Referring to the source's *current* version would make history mutable — the claim would silently re-point when the source was updated, which is precisely what I7 exists to prevent.

5. **Replay pinning is recorded as unmet, not quietly claimed.**
   The second half of I7 concerns resolving pinned versions when replay re-runs sources. Replay folds the log and re-runs nothing, so there is no pinning to do. When replay gains re-execution, this is where it looks.

## Risks / Trade-offs

- **[Optional attribution weakens the invariant's letter]** → **Mitigation**: it is stated plainly, in the spec and here, rather than being papered over. The alternative — inventing a source for correlate steps — would satisfy the letter and corrupt the meaning.
- **[Existing steps have no attribution]** → **Mitigation**: no backfill, because there is no honest value to backfill with. A step from before this change reads as unattributed, which is accurate.
- **[Version is a free string]** — nothing validates it against the source → **Mitigation**: correct for now; a version is whatever the pack author says it is, and constraining it needs a versioning scheme nobody has chosen.

## Migration Plan

Additive. `Step` fields are optional, so existing logs decode unchanged and existing steps read as unattributed. `SourceSpec.version` defaults, so no pack changes. No stored data migrates.

## Open Questions

- What a source's version should *mean* — a pack author's label, a content hash of the response schema, an upstream API version. Deferred: recording the field is useful before its semantics are pinned down, and a scheme chosen now would be guesswork.
