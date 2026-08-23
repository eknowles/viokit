# Promoted Sources Are Registered

## Why

A default deployment can see **9 of 38 promoted sources**. Verified by running it:
`catalog_list --kind source` returns nine, all from `web-dns`.

The other 29 were promoted into invisibility. Registration is explicit by design — "a pack file no
manifest names stays invisible to the catalog" — but promotion only ever writes half of it. The
promoter appends a `SourceSpec` to `packs/<category>/sources.ts` and stops; nothing adds the source to
a manifest, and nothing notices. Eight of the ten packs have no manifest at all, so every source in
them is unreachable: the catalog cannot name it, no transform can run it, and `verify_access` — built
last for exactly this catalog — cannot check it.

A tenth pack, `people-identity`, *has* a manifest and still is not registered: `defaultPacks` lists
only `web-dns`.

This is the coverage problem Track A is about, hiding one level down from where it was being looked
for. The discovery harness found 47 candidates and promoted 37; the deployment acts as though it
found nine.

Two further defects in the promoter, both visible once the write path is read:

- **It writes to the wrong place.** `join(process.cwd(), "packs", category)` — but packs live at
  `packages/packs/<category>`. Promotion only lands correctly if it happens to be run from
  `packages/`, and there is no `./packs` at the repo root to show for the times it was not.
- **Its write path has no test**, because that hardcoded path gives nothing to point at a temporary
  directory. This is a standing debt on the roadmap.

## What Changes

- **The eight source-only packs get manifests**, in the shape `people-identity` already uses: sources,
  no transforms. Hand-written and explicit, because explicit registration is the guardrail, not the
  problem.
- **Every pack is registered by default.** `defaultPacks` names all ten, so a deployment sees the
  catalog the discovery harness actually built.
- **Drift becomes a test failure.** A conformance test asserts that every `SourceSpec` a pack's
  `sources.ts` exports is named by that pack's manifest. This is the check that would have caught the
  original gap, and it keeps catching it without asking anyone to remember.
- **The promoter writes where packs actually live**, through a configurable root rather than a guess
  about the working directory.
- **The promoter's write path gets tests**, which the root makes possible — paying the standing debt.

Not in this change: making registration implicit (deriving a manifest from the module's exports would
reverse a deliberate decision), having the promoter generate manifest code, transforms for any of the
newly-registered packs, and the reclassification sweep itself — which this unblocks by taking the
verifiable surface from 9 sources to 38.

## Capabilities

### Modified Capabilities

- `source-catalog`: promotion writes into the pack tree the deployment actually reads, and its write
  path is covered.
- `agent-integration`: the catalog reports every promoted source, not only those in the one pack that
  happened to have a manifest.

## Impact

- `packages/packs/*`: eight new `manifest.ts` files, source-only; a subpath export pattern so a pack's manifest and sources resolve without a per-pack entry.
- `packages/agent`: `defaultPacks` registers every pack.
- `packages/source-catalog`: a `PackRoot` seam for the promoter, defaulting to the real pack
  directory; the write path tested against a temporary root.
- Tests: pack/manifest conformance across every pack, the promoter's write path, and the catalog
  reporting the full source set.
- No TDR required: no new store, transport, serialization, or UI dependency.
