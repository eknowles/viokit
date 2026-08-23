# Tasks — P3 Agent Interfaces

> Prereq: TDR-016 marked `decided` (task 1) — the TDR gate is hard, so nothing in groups 3–8 starts before it.
> Verification per `CONTRACT.md`: `bun run --filter '@viokit/<pkg>' typecheck`, package tests, `npm exec -- ultracite check`.

## 1. TDR-016 — engine front-end technology

- [x] 1.1 Write `openspec/decisions/TDR-016-engine-frontend.md` from `TEMPLATE.md`: options for the engine's agent/human surface (stdio MCP + CLI per TDR-014's precedent; low-level MCP handlers publishing JSON Schema; deferring everything to the TDR-003 network API), criteria, analysis, recommendation.
- [x] 1.2 State explicitly that the REST/GraphQL API and event stream stay out of scope pending TDR-003, and that this TDR covers only in-process front-ends over `Engine`.
- [x] 1.3 Mark `decided` and add the row to `openspec/decisions/README.md`.

## 2. Spike — Effect Schema to JSON Schema

- [x] 2.1 Convert the real `SourceSpec`, `TransformSpec`, and a `Schema.Any`-typed transform input through `effect/JsonSchema` (Draft 2020-12) and record which convert cleanly.
- [x] 2.2 Decide the fallback shape for a spec that cannot convert (design decision 4 / risk 3): entry returned without a schema document, gap reported. Record the finding in `design.md` if it changes the approach.

## 3. Schema additions

- [x] 3.1 Add `CatalogEntry` with its source/transform/type variants (id, kind, name, description, pack, archetype where applicable) to `packages/schema`.
- [x] 3.2 Add `PackManifest` (pack slug, `SourceSpec`s, and `TransformSpec`s bound to their projection and source) and `CatalogFilter` (kind, pack, archetype).
- [x] 3.3 Add typed errors `UnknownCatalogEntry` and `PackRegistrationError`.
- [x] 3.4 Add the `Catalog` seam to `packages/schema/src/seams.ts`: `list(filter)`, `describe(id)`, `runTransform(transformId, input)`.
- [x] 3.5 Boundary decode tests for `CatalogEntry` and `PackManifest` (I6).

## 4. Catalog layer in the engine

- [x] 4.1 Implement the catalog layer in `packages/engine`: fold registered `PackManifest`s plus `OntologyRegistryService` definitions into `CatalogEntry` records at layer construction; fail construction on invalid manifest content, leaving no partial catalog.
- [x] 4.2 Implement `list` with kind/pack/archetype filtering, returning empty (not an error) for an empty catalog or a filter matching nothing.
- [x] 4.3 Implement `describe`: entry detail plus input/output JSON Schema per the task-2 finding; `UnknownCatalogEntry` for an unregistered id.
- [x] 4.4 Implement `runTransform(transformId, input)`: resolve the registered spec/source/projection triple, delegate to `Engine.runTransform`, and return the staged steps.
- [x] 4.5 Extend the `Engine` service with the catalog methods; add `OntologyRegistryLayer` and the catalog slice to `EngineLayer`, watching provide-order (design decision 7).
- [x] 4.6 Tests: registered packs appear attributed to their pack; unregistered pack files stay invisible; invalid manifest leaves the catalog untouched; an input built from a described schema decodes; catalog reads append no step and write no evidence (I3).

## 5. Pack manifests

- [x] 5.1 Add a manifest export to at least one pack (`web-dns`) covering its promoted `SourceSpec`s.
- [x] 5.2 Register a transform in that manifest — spec, source, and bound projection — so the transform path is exercised end to end rather than only the source path.
- [x] 5.3 Test: registering the pack surfaces its sources and its transform in the catalog, and the transform runs by id.

## 6. `packages/agent` scaffold

- [x] 6.1 `package.json` and `tsconfig.json` following the sibling packages (`paths: {"*": ["./*"]}`, no `baseUrl`); workspace registration; dependencies limited to `@viokit/engine`, `@viokit/schema`, and the MCP SDK pinned per TDR-016.
- [x] 6.2 Shared `AgentProgramLayer` composing `EngineLayer` with the registered manifests — the one layer both front-ends are built from.

## 7. MCP and CLI front-ends

- [x] 7.1 MCP server exposing catalog list/describe, `runTransform`, `correlate`, `insert`, `log`, `queryEntity`, `replay`, `paths`, `timeline`, `spatial`, `relatedness` — thin zod wire shapes, authoritative decode against the shared schema inside the service (design decision 5).
- [x] 7.2 CLI mapping the same operations to commands, reporting failure distinguishably from success for scripts.
- [x] 7.3 Tests: MCP tool round-trips over an in-memory transport against a fake engine layer; malformed input returns an error and changes no state (I6); an engine failure surfaces as an error, not a successful result.
- [x] 7.4 Parity test enumerating both surfaces' operations and asserting the sets are equal (I8).
- [x] 7.5 Guardrail test: run a front-end against a substituted engine and assert every operation's behavior comes from the substitute — the front-end contributes none, and there is no path to evidence, log, or graph around it (I8, I4/I10).
- [x] 7.6 Test that a graph write attempted without an evidence-attributed step is rejected through the front-end (I2).

## 8. Verification and close-out

- [x] 8.1 `bun run --filter '@viokit/agent' typecheck`, `--filter '@viokit/engine' typecheck`, `--filter '@viokit/schema' typecheck`; full engine suite still green (68 tests at P2 exit).
- [x] 8.2 `npm exec -- ultracite check` clean.
- [x] 8.3 End-to-end proof: an agent lists the catalog over MCP, runs a listed transform by id, commits the staged steps, and reads the graph back — all through tools.
- [x] 8.4 Invariant checklist (`CONTRACT.md` I1–I12), with I8, I6, I4/I10, and I3 called out explicitly.
- [x] 8.5 Update `ROADMAP.md` P3: the interface half is closed; the UI half remains gated on TDR-002/003/004/008/009/012.
