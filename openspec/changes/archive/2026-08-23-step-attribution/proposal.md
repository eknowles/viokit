# Step Attribution

## Why

Provenance stops one level short. Selecting a node shows the steps that produced it and the evidence each was attributed to — but not *what ran*. A step says "added this entity" and points at an artifact; it cannot say which transform derived it, from which source, at which version.

That is not a missing nicety. **I7 is unimplemented.** `CONTRACT.md` requires that "every Step records sourceId+version" and that "replay pins versions"; `Step` carries only `evidenceIds`, `id`, and `operation`, and `SourceSpec` has no version field at all. One of the twelve invariants has been unmet since P0, and nothing in the codebase notices.

The consequence is concrete: two runs of the same transform against a source that changed produce indistinguishable steps. An investigation cannot say which version of a source a claim rests on, which is exactly the question an evidentiary export (TDR-010) will have to answer.

## What Changes

- **Sources carry a version.** A `SourceSpec` declares one, defaulting explicitly so existing specs stay valid and unversioned sources are visibly unversioned rather than silently assumed current.
- **Steps record what produced them** — the transform, the source, and that source's version — so a claim can be traced to the thing that derived it and the state that thing was in.
- **Attribution is optional in shape and honest about it.** A step derived by correlating existing graph state has no source, and pretending otherwise would be worse than recording nothing. Steps that *do* come from an acquisition always carry it.
- **The console shows it**: provenance names the transform and the versioned source alongside the evidence.

Not in this change: version *resolution* at replay (nothing re-runs sources during replay, so there is nothing yet to pin), source version negotiation, and an export format that consumes this (TDR-010).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `core-schema`: sources carry a version; steps record the transform, source, and source version that produced them.
- `engine-runtime`: steps produced by running a transform carry that attribution.
- `console`: provenance names what ran, not only what it was attributed to.

## Impact

- `packages/schema`: `SourceSpec.version`; `Step` gains optional `transformId`, `sourceId`, and `sourceVersion`.
- `packages/engine`: the transform runner stamps attribution onto the steps it stages.
- `apps/console`: the provenance panel names the transform and versioned source.
- Tests: staged steps carry the transform and versioned source; correlate-derived steps carry none and say so; attribution survives commit and replay; a spec without a declared version reads as explicitly unversioned.
- **I7 moves from unimplemented to partially met**, and the remaining half — pinning versions at replay — is recorded rather than assumed.
