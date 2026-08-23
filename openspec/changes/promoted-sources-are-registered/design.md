## Context

See `proposal.md` — Why. Four facts shape this:

- **Registration is explicit on purpose.** `catalog.ts` says so, and the reason is sound: a file
  existing should not mean it is live.
- **`PackManifest` already supports a source-only pack.** `people-identity` is one — `transforms: []`
  — so the eight missing manifests need no new concept.
- **Pack files are not type-checked by any tsconfig.** The promoter decodes a spec before writing for
  exactly this reason. A manifest, being ordinary TypeScript that the packs project *does* compile,
  gets checked — so registering a source also type-checks it for the first time.
- **The promoter's path is `process.cwd()`-relative**, which is why it cannot be tested and why it
  writes to the wrong place.

## Goals / Non-Goals

**Goals:**
- Every promoted source is visible to a default deployment.
- The gap cannot silently reopen.
- Promotion writes where the deployment reads.

**Non-Goals:**
- Deriving registration from module exports (see Decisions 1).
- Generating manifest source code from the promoter.
- Adding transforms, projections, or ontology types to the newly-registered packs. They register
  sources; a source with no transform is still worth reporting, which is precisely why
  `people-identity` registers two sources nothing here can acquire.

## Decisions

1. **Manifests stay hand-written; registration stays explicit.**
   The tempting fix is `import * as sources` and register whatever the module exports. It would have
   made this class of gap impossible — and it would reverse a deliberate decision, silently, as a side
   effect of a bug fix. The guardrail is not what failed here; *nothing noticed* the guardrail was
   only half-satisfied. So the fix is to make it noticed (Decision 2), not to remove it.

2. **Drift is a test, not a convention.**
   A conformance test reads each pack's `sources.ts` exports and asserts the pack's manifest names
   each one. It is the cheapest possible thing that would have caught 29 invisible sources, it runs on
   every commit, and it does not depend on anyone remembering a two-step ritual. A pack with no
   manifest at all fails it too, which is the case that actually occurred — so the pack directories are
   read from disk and compared with the table of registered ones.

3. **The promoter takes a pack root as a service, defaulting to the real one.**
   `PackRoot` follows the seam pattern used everywhere else here. It fixes the wrong-path defect and
   makes the write path testable against a temporary directory, which is what the standing debt asked
   for. A default means existing callers need no wiring.

4. **The promoter still does not write manifests.**
   It could append an import and a list entry, but generating code that edits hand-written code is
   fragile in proportion to how hand-written that code is — `web-dns`'s manifest carries transforms,
   projections, and prose. The conformance test turns a forgotten registration into a failed build,
   which is the same outcome with none of the fragility.

## Risks / Trade-offs

- **[Registering 29 sources changes what the catalog advertises]** — a deployment that was quietly
  seeing nine now sees thirty-eight, some not runnable → **Mitigation**: this is the correction, not a
  side effect. `runnabilityOf` already reports what can and cannot be acquired, and `people-identity`
  establishes the precedent that a non-runnable source is still worth reporting.
- **[Newly-registered sources have never been type-checked]** — pack files compile for the first time
  when a manifest imports them, so registration may surface existing errors → **Mitigation**: that is
  a benefit arriving as a cost; anything it finds was already broken.
- **[The conformance test reads pack source files]** — it depends on the shape of generated code →
  **Mitigation**: it imports the modules and inspects exported values rather than parsing text, so it
  depends on the module contract, not on formatting.

## Migration Plan

Additive. No stored data, no schema change. A deployment that wants the old, narrower catalog can
still pass its own pack list to `makeAgentProgramLayer` — `defaultPacks` is a default, not a
constraint. Rollback is reverting `defaultPacks`; the manifests are inert until registered.

## Open Questions

- Whether the newly-registered packs should carry transforms, and in what order. Registering them
  makes the question askable — until now the sources were not even visible enough to prioritise.
