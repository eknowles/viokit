## Context

See `proposal.md` — Why. The engine is complete through P2 and composed in `packages/engine/src/engine.ts`: `Engine` is a thin pass-through over `EvidenceService`, `DuckDBGraphService`, `SourceRuntimeService`, `TransformRunnerService`, and `CorrelateResolverService`. Three facts about the current state shape this design:

- **Nothing loads packs.** `packs/*/sources.ts` export `SourceSpec` constants, written there by the source-discovery harness. No code imports them, and the engine has no notion of a pack. The catalog is what turns those exports into deployment capability.
- **`Engine.runTransform` takes a projection function.** Its signature is `(spec, source, project, input)`, where `project: (evidence, input) => readonly StepOperation[]` is a JavaScript callback. A function cannot cross an MCP or CLI boundary, so a remote caller cannot invoke `runTransform` in its current form.
- **The ontology registry is not in the engine's layer.** `OntologyRegistryService` exists in `packages/engine/src/ontology.ts` but `EngineLayer` never provides it, so the engine currently cannot report registered types.

Constraints: Effect 4.0.0-beta.103 throughout; decode at every boundary (I6); the TDR gate is hard, and the P3 UI-side TDRs (002/003/004/008/009/012) are all still `proposed`, which is why this change stops at the in-process front-ends.

## Goals / Non-Goals

**Goals:**
- One catalog, derived from registered packs plus the ontology registry, that both front-ends read — no front-end keeps its own registry.
- Transform invocation that survives a serialization boundary: by catalog id and decoded input, with no callback in the payload.
- Front-ends provably logic-free: substituting the engine substitutes all behavior.

**Non-Goals (design-level, beyond the proposal's scope line):**
- No dynamic filesystem discovery of packs. Registration is an explicit, type-checked import.
- No catalog persistence. The catalog is derived state, rebuilt at layer construction; it is not stored and never enters the step log.
- No authentication or authorization on either front-end. Both are local, in-process surfaces; access control is P4 `governance`.

## Decisions

1. **Front-ends live in a new `packages/agent`, not in `packages/engine`.**
   `CONTRACT.md` gives `agent-integration` its own capability with its own boundary, and the engine has no front-end dependencies today. Putting `mcp.ts`/`cli.ts` in `packages/engine` would pull the MCP SDK and argument parsing onto the dependency surface of every engine consumer, including the future UI server. Alternative considered: co-locating them in `packages/engine` the way `packages/source-catalog` co-locates its own front-ends — rejected because the catalog package *is* its front-end's product, whereas the engine is a library many surfaces consume. The new package depends on `@viokit/engine` and `@viokit/schema` only.

2. **The catalog is a derived projection over a registered pack manifest, built at layer construction.**
   A `PackManifest` is a plain record — pack slug, its `SourceSpec`s, its `TransformSpec`s with bound projections — that a deployment passes to the catalog layer. The layer folds the manifests plus the ontology registry's definitions into `CatalogEntry` records once and serves reads from that. Alternatives considered: scanning `packs/` at runtime (rejected — no type checking, unpredictable in a bundled deployment, and a filesystem dependency in the engine); registering entries imperatively one at a time (rejected — leaves a deployment's capability implicit and racy). Invalid manifest content fails the layer, so a deployment either has a valid catalog or does not start.

3. **Transforms are invoked by catalog id; the projection is registered, not passed.**
   The manifest binds each `TransformSpec` to its projection function and its `SourceSpec`. The catalog exposes `runTransform(transformId, input)`, resolves the registered triple, and delegates to the existing `Engine.runTransform(spec, source, project, input)`. `Engine`'s current callback signature stays as the in-repo API — packs still call it directly — so this is additive. Alternatives considered: shipping projections as serialized expressions (rejected — arbitrary code over an agent boundary, and unreviewable); making every transform a pure schema mapping so no callback is needed (rejected — too large a change to the transform framework for this slice, and P2's archetypes assume a projection).

4. **Describe renders contracts as JSON Schema Draft 2020-12 via `Schema.toJsonSchemaDocument`.**
   The language-neutral contract the spec requires is a conversion of the schema that actually decodes, not a hand-maintained parallel description that could drift from it. The converter lives on `Schema` (`Schema.toJsonSchemaDocument(schema)` returning an `effect/JsonSchema` `Document<"draft-2020-12">`); `effect/JsonSchema` itself only defines the document types and dialect conversions. The document describes the *encoded* form, which is the correct contract for a wire boundary. Alternatives considered: returning the Effect Schema AST (rejected — not language-neutral, an internal shape); hand-writing per-entry descriptions (rejected — drifts from the schema that actually decodes, which is exactly the I6 failure mode).

   **Spike finding (task 2).** Conversion succeeds on `SourceSpec`, on `TransformSpec`, on realistic transform input/output `Struct`s, and — importantly — on the schema values read back out of `TransformSpec`'s `Schema.Any`-typed `input`/`output` fields, so the `Schema.Any` typing does not obstruct conversion. `Schema.Any` itself converts to the empty document `{}` (honest: it constrains nothing), which is returned as-is rather than treated as a failure. The one real failure mode is a `Schema.Any` field holding something that is not a schema at all: conversion throws a raw `TypeError` (`undefined is not an object`), a defect rather than a typed failure, so it must be caught with `Effect.try` — `Effect.catchTag` will not see it.

5. **MCP tool advertisement keeps the `packages/source-catalog` shape; the authoritative decode stays Effect Schema.**
   `McpServer.registerTool` in the pinned SDK (1.30.0) accepts zod shapes only — there is no raw-JSON-Schema path without dropping to the low-level request handlers. So the tool wire shapes stay thin zod (ids, filter strings, a JSON payload), and every payload is decoded against the shared Effect Schema inside the service before it reaches the engine, matching the harness precedent. The rich contract a caller needs comes from catalog `describe` (decision 4), not from the tool advertisement. Trade-off accepted: two descriptions of the wire shape exist, but the thin one is not authoritative for anything.

6. **The CLI is a command mapping over the same program layer, and parity is a test, not a convention.**
   Both front-ends are built from one `AgentProgramLayer`. A parity test enumerates the operations exposed by each surface and asserts the sets are equal, so a new engine operation cannot land on one surface only.

7. **`EngineLayer` gains `OntologyRegistryLayer` and the catalog slice.**
   The catalog needs the ontology registry, and the engine's catalog methods need the catalog. Layer ordering matters in this beta — `TransformRunnerLayer` already forced `EvidenceLayer` to be provided last in the pipe, and the catalog slice must be provided before the registry it consumes for the same reason.

## Risks / Trade-offs

- **[Registering a projection couples packs to the engine's callback shape]** — pack authors now write manifests that reference engine types → **Mitigation**: the manifest type lives in `@viokit/schema` alongside `SourceSpec`, so packs depend on the schema package they already depend on, not on `@viokit/engine`.
- **[Zod and Effect Schema both describe the wire]** (decision 5) → **Mitigation**: the zod shapes stay at ids/strings/JSON-blob granularity, and the decode that matters happens inside the service; a drifting zod shape produces a decode error, never a wrong write.
- **[A `Schema.Any` field can hold a non-schema, and conversion then throws a defect]** — `TransformSpec.input`/`output` are typed `Schema.Any`, so nothing at the type level stops a manifest from registering a plain object there; the spike showed conversion throws a raw `TypeError` in that case (resolved: the converter handles every schema this codebase actually uses, including the values read back out of those fields) → **Mitigation**: wrap conversion in `Effect.try` so the defect becomes a typed failure, and have `describe` return the entry without a schema document rather than failing the call, reporting the gap on the entry.
- **[MCP SDK protocol drift]** — same risk TDR-014 accepted → **Mitigation**: same mitigation, the pinned 1.30.x line and a small tool surface.
- **[Catalog reads could be mistaken for engine state]** → **Mitigation**: the catalog writes nothing and appends nothing; a test asserts the step log is unchanged across catalog operations (I3).

## Migration Plan

Additive throughout. `Engine`'s existing methods and signatures are unchanged, so `pipeline-seam.test.ts`, `mini-investigation.test.ts`, and any pack calling `runTransform` directly keep working. Packs gain an optional manifest export; a pack without one is simply not registered. `EngineLayer` gains layers but no behavior change for existing callers. No data migration — the catalog is derived and holds no state across restarts. Rollback is removing `packages/agent` and the catalog slice.

## Open Questions

- Whether the CLI should eventually adopt `@effect/cli` rather than the `node:util` `parseArgs` shape used by `packages/source-catalog/src/cli.ts`. Deferred: it changes no requirement, no spec scenario, and no task boundary — only the internals of the command surface.
