## Why

The goal is to hand the engine one seed, such as a domain, and have it expand unattended through every applicable wrapped tool into a tree of entities, each traceable to the run that produced it. Today every transform must be run by hand with its input typed out, and nothing records which entity led to which run. Three tools are wrapped and share a vocabulary, which is enough to build the expander over.

## What Changes

- A transform declares which entity kind it accepts and which of its input fields takes that entity's value. The existing transforms that take a domain or an address declare it.
- A new expander takes a seed (a kind and a value), records the seed as evidence, then repeatedly finds every (entity, transform) pair not yet run, runs it through the existing engine path, commits the staged steps, and continues until a cap is reached or nothing is left.
- Every run writes a run record: the transform, the input entity, when it ran, how long it took, how it ended, and the entities and relations it added. The tree is read from these records, not stored separately.
- Caps bound every expansion: depth, total entities, total runs, and wall-clock time. The reason an expansion stopped is reported.
- A transform whose source is not runnable in this deployment is skipped once, with the reason, instead of failing per entity. A failing run is recorded and the expansion continues.
- Two operations, `tree_expand` and `tree_show`, are added to the shared operation table so the CLI, MCP server and HTTP API all get them (I8).
- Whether active tools run is a policy argument that defaults to both kinds, following the project decision that nothing is refused on the basis of kind.

Out of scope: running transforms in parallel (serial first), choosing which branches matter, scheduling or resuming across restarts, a console view of the tree, and the tool-catalog harness.

## Capabilities

### New Capabilities
- `investigation-tree`: expanding a seed through applicable transforms under caps, and recording each run so the tree can be read back.

### Modified Capabilities

## Impact

- `packages/schema`: an optional `accepts` on `TransformSpec`; a `RunRecord` schema.
- `packages/engine`: a run-log seam with a filesystem backend, and the expander.
- `packages/agent`: two operations.
- `packages/packs/web-dns`: `accepts` declarations on the existing transforms.
- No new dependency. Without `accepts`, a transform is never expanded automatically, so existing behaviour is unchanged.
