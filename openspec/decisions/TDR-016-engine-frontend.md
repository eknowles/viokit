# TDR-016 — Engine front-end: in-process stdio MCP + CLI over the `Engine` service

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** `openspec/changes/p3-agent-interfaces/{proposal,design}.md`; invariants I8, I6, I4/I10; TDR-014 (source-catalog front-end, same technology, different scope); TDR-003 (real-time transport — still `proposed`, gates the network API); `ROADMAP.md` P3

## Decision summary
> Expose the `Engine` service to agents over **stdio MCP** (`@modelcontextprotocol/sdk` v1, pinned 1.30.x) and to humans over a **thin CLI**, both built from one program layer in a new `packages/agent`; tool wire shapes stay thin zod while the authoritative decode stays Effect Schema, and the network API (REST/GraphQL + event stream) is explicitly deferred to TDR-003.

## Context
- P2 closed with a complete engine, but the only way to drive it is TypeScript written against `Engine` inside this repo. P3's goal is "humans and agents drive the same engine" (I8), and `CONTRACT.md` assigns `agent-integration` the catalog, MCP, and guardrails.
- TDR-014 already chose stdio MCP + CLI for the discovery harness, but scoped itself explicitly to "`packages/source-catalog` front-end layers only" and to that harness's five operations. The engine surface is a different, larger surface (catalog, transform execution, correlate, graph commits, five read surfaces) reaching evidence and the graph rather than a curation database, so it needs its own decision rather than an implied extension.
- Constraints: Effect 4.0.0-beta.103; decode at every boundary (I6); front-ends must hold no business logic and grant no privileged path (I8); no policy or raw network I/O outside `SourceRuntime` (I4/I10); must run headless in CI.
- The P3 UI-side TDRs (002 client state, 003 transport, 004 docking, 008 schema→form, 009 Arrow mapping, 012 view-state) are all still `proposed`. Any decision here that requires a network server would inherit that gate and block the whole slice.
- Affects: a new `packages/agent`; the `Engine` seam gains catalog methods; no change to acquisition, transform, correlate, or graph behavior.

## Options considered

### Option A — stdio MCP (`@modelcontextprotocol/sdk` v1) + thin CLI, both over one program layer
- **Description:** Mirror TDR-014's shape at engine scale. `McpServer.registerTool` maps each operation onto the `Engine` service; a `parseArgs`-style CLI maps the same operations to commands; both are constructed from one `AgentProgramLayer`. Tool advertisement uses thin zod shapes (ids, filters, a JSON payload); the payload is decoded against the shared Effect Schema inside the service before it reaches the engine.
- **Pros:** Proven in this codebase — the harness already runs this exact shape, including its round-trip test approach (`Client` + `InMemoryTransport`). No new dependency: the SDK is already pinned at 1.30.0 in the workspace. Runs headless, in-process, no server infrastructure or ports. Needs none of the six `proposed` P3 TDRs, so it ships now. Parity between the two surfaces is testable by enumeration.
- **Cons:** Two descriptions of the wire shape exist (thin zod for advertisement, Effect Schema for decoding). Agents must run the process locally — no remote access. Protocol-version coupling to the MCP spec.

### Option B — Low-level MCP request handlers publishing JSON Schema derived from Effect Schema
- **Description:** Skip `McpServer.registerTool` (which accepts zod only in the pinned SDK) and implement `tools/list` and `tools/call` directly on the low-level `Server`, advertising input schemas converted from Effect Schema via `effect/JsonSchema`.
- **Pros:** One authoritative description of every wire shape, derived from the schema that actually decodes — removes the drift surface in Option A entirely.
- **Cons:** Gives up the SDK's ergonomics and its result/error plumbing for handwritten handlers, which is more front-end code in the layer that is supposed to hold none (I8 pressure). Couples us to a lower-level SDK surface that is more likely to churn than `registerTool`. `TransformSpec` carries its input/output as `Schema.Any` fields, so the conversion is not guaranteed for every registered spec — an unconvertible spec would break tool advertisement itself rather than degrading one `describe` call.

### Option C — Defer entirely to the TDR-003 network API
- **Description:** Build no front-end now; wait for the REST/GraphQL + WebSocket/Arrow surface and expose the engine there, with MCP as a client of that API.
- **Pros:** One surface eventually, not two. Remote access from the start. Aligns MCP and UI on the same transport.
- **Cons:** Blocked behind TDR-003, which is `proposed` — the entire interface half of P3 waits on a decision that is really about the UI's streaming needs. Adds a network hop and a serialization layer to what is currently an in-process call, for no benefit to a local agent. Leaves I8 unproven on the real engine for however long that takes.

### Option D — CLI only, agents shell out
- **Description:** Ship only the command surface; agents invoke it as a subprocess.
- **Pros:** No SDK dependency at all; smallest surface.
- **Cons:** Agents get no native tool discovery — the catalog's whole purpose is to be discoverable by an agent runtime. Structured results degrade to parsing stdout. Same rejection reason as TDR-014's Option C, and it fails this slice's premise harder because the catalog is the deliverable.

## Evaluation criteria
1. **Unblocks now** — does it require a `proposed` TDR to be decided first?
2. Agent/runtime interoperability (MCP ecosystem, native tool discovery)
3. Fit with the Effect/schema-first architecture, and pressure on I8 (no logic in front-ends)
4. Consistency with the existing codebase (TDR-014 precedent, testability)
5. Maintenance and protocol-drift exposure
6. Effort to integrate

## Analysis
- **Criterion 1 eliminates Option C.** It is the right long-term shape and the roadmap already anticipates it, but it inherits TDR-003's gate and would leave the engine undriveable for the duration. Deferring the network API is cheap precisely because Option A does not foreclose it: a REST/RPC surface later is another adapter over the same program layer, not a rewrite.
- **Criterion 2 eliminates Option D**, for the same reason TDR-014 rejected CLI-only, and more sharply here — a catalog that agents cannot discover natively defeats the change.
- **A vs B is the real decision, and it turns on criterion 3.** B's advantage is genuine: it removes the drift surface. But it buys that by hand-rolling the protocol plumbing inside the component that must contribute no behavior, which is the invariant this slice exists to prove. A's drift risk is contained by keeping the zod shapes at ids/strings/JSON-blob granularity and making them non-authoritative for anything: a drifting zod shape produces a decode error from the real schema, never a wrong write. The rich, language-neutral contract a caller actually needs is served by catalog `describe`, which returns `effect/JsonSchema` Draft-2020-12 documents — so B's benefit is largely available under A, at the read surface where it belongs, and a spec that fails to convert degrades one `describe` response instead of breaking tool advertisement.
- **Criterion 4 favors A decisively.** The harness runs this shape today, including the in-memory-transport round-trip test pattern, so the testing approach and the failure modes are known. Criterion 5 is a wash between A and B on protocol drift, though A rides the more stable SDK surface. Criterion 6 favors A.
- What A gives up: remote access, and a single authoritative wire description. Both are recovered later — remote access by the TDR-003 API, the single description if the SDK grows a raw-JSON-Schema path (or v2 stabilizes) and B becomes cheap.

## Recommendation
- **Option A.** stdio MCP via `@modelcontextprotocol/sdk` v1 (pinned 1.30.x, matching TDR-014) plus a thin CLI, both constructed from one `AgentProgramLayer` in a new `packages/agent`. Front-ends stay logic-free adapters over `Engine`; every payload is decoded against `@viokit/schema` inside the service (I6); catalog `describe` publishes JSON Schema Draft 2020-12 via `effect/JsonSchema` as the language-neutral contract.
- **Scope of this TDR:** in-process front-ends over `Engine` only. The REST/GraphQL API and the WebSocket/Arrow event stream are **out of scope and remain gated on TDR-003**; when that is decided, the network surface becomes a third adapter over the same program layer and this TDR is not superseded by it.
- **Package placement:** `packages/agent`, not `packages/engine`, so the MCP SDK and argument parsing stay off the dependency surface of every engine consumer (the future UI server included). This diverges from `packages/source-catalog`, which co-locates its front-ends, because there the front-end *is* the package's product.
- **What would change this decision:** the SDK exposing raw JSON Schema tool registration at the `registerTool` level (making Option B nearly free); MCP v2 (`@modelcontextprotocol/server`) stabilizing as the clear default; TDR-003 landing early enough that a network-first surface costs nothing; or evidence that MCP adoption collapses in favor of another agent protocol.

## Open questions
- Whether the CLI adopts `@effect/cli` rather than the `node:util` `parseArgs` shape used by `packages/source-catalog/src/cli.ts`. Not blocking — it changes no operation, no requirement, and no test.

## References
- `openspec/changes/p3-agent-interfaces/{proposal,design}.md`; `specs/agent-integration/spec.md`
- TDR-014 (same technology, harness scope); TDR-003 (network transport, `proposed`)
- `CONTRACT.md` — I8 (agent parity, no privileged path), I6 (decode at boundaries), I4/I10 (policy isolation)
- `packages/source-catalog/src/{mcp,cli,program}.ts` — the precedent this follows
