# P3 Agent Interfaces — self-describing catalog + MCP/CLI over the Engine

## Why

P2 closed with a complete engine — acquisition, evidence, transforms, correlate, and a DuckDB-backed 4D graph with four query surfaces — but the only way to drive it is to write TypeScript against `Engine` inside this repo. Nothing outside the repo can discover what the engine can do or run it. `ROADMAP.md` P3 opens with "humans and agents drive the same engine" (I8), and its capability map assigns `agent-integration` the catalog, MCP, and guardrails.

P3's web-UI half is blocked: TDR-002, 003, 004, 008, 009, and 012 are all still `proposed`, and the TDR gate is hard. The catalog + agent/human front-ends need none of them, prove I8 on the real engine, and give the UI a discovery surface to build against later. That is the slice to build now.

## What Changes

- **Runtime catalog** — a self-describing registry of what this deployment can do: the `SourceSpec`s registered from packs, the transform archetypes and `TransformSpec`s available, and the ontology types registered at runtime. Entries are listable, filterable, and individually describable, with each transform's input/output schemas rendered in an encoded, language-neutral form so a caller can construct a valid invocation without reading our source.
- **Pack registration** — an explicit manifest that binds packs into a running engine. Today `packs/*/sources.ts` are exported constants nothing loads; the catalog is what makes them reachable.
- **MCP server over `Engine`** — agent-facing tools for catalog discovery, `runTransform`, `correlate`, `insert`, `log`, `queryEntity`, `replay`, and the four graph queries (`paths`, `timeline`, `spatial`, `relatedness`).
- **CLI over `Engine`** — the same operations as terminal commands for humans and scripts.
- **No privileged path** — both front-ends are logic-free adapters over the one `Engine` service; neither can reach the graph, evidence, or network except through it (I8, I4/I10).
- **TDR-016** — engine front-end technology, decided before implementation. TDR-014 settled stdio MCP + thin CLI but scoped itself to `packages/source-catalog` only; the engine surface needs its own decision, including whether the network API waits for TDR-003.

Explicitly not in this change: the REST/GraphQL API, the WebSocket/Arrow event stream, and the web UI. Those are the TDR-gated half of P3 and follow separately.

## Capabilities

### New Capabilities
- `agent-integration`: the runtime catalog (self-describing sources, transforms, and ontology types), the MCP tool surface, the CLI surface, and the parity guarantee that both drive the engine through the same service with no privileged bypass.

### Modified Capabilities
- `engine-runtime`: the engine gains a catalog surface — it SHALL report the sources, transforms, and ontology types registered in the running deployment, so front-ends have one place to discover capability.

## Impact

- `packages/schema`: catalog record types (`CatalogEntry` and its source/transform/type variants), the `Catalog` seam, a `PackManifest` type, and typed errors (`UnknownCatalogEntry`, `PackRegistrationError`).
- `packages/engine`: a `Catalog` layer folding registered packs plus the ontology registry into catalog entries; `Engine` gains catalog methods. No change to acquisition, transform, correlate, or graph behavior.
- `packages/agent` (new): `mcp.ts`, `cli.ts`, and the shared program layer over `Engine`. Kept out of `packages/engine` so the MCP SDK and CLI parsing stay off the engine's dependency surface, matching the `agent-integration` capability boundary in `CONTRACT.md`.
- `packs/*`: gain a manifest export so packs can be registered; the promoted `SourceSpec`s already there become reachable.
- Dependencies: `@modelcontextprotocol/sdk` (already pinned at 1.30.0 for `source-catalog`) extends to the new package, subject to TDR-016.
- Tests: catalog listing/filtering/describe, encoded transform schemas, MCP tool round-trips over a fake engine layer, CLI-to-MCP parity on every operation, and a guardrail test that the front-ends expose no path around `Engine` (I8). Invariants I6 (decode at both front-end boundaries), I8 (parity), I4/I10 (no front-end policy or raw I/O).
- Docs: `ROADMAP.md` P3 is split — this change closes the interface half; the UI half stays gated on TDR-002/003/004/008/009/012.
