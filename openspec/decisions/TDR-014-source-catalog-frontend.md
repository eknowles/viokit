# TDR-014 — Source-catalog front-end: MCP server + CLI over one Effect service

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-05
- **Related:** `openspec/changes/source-discovery-harness/design.md` (interface); invariants I8; TDR-013 (store)

## Decision summary
> Expose the `SourceCatalog` service over **stdio MCP** (`@modelcontextprotocol/sdk`) for agents and a thin **CLI** for humans/scripts, sharing one Effect service so both paths are identical.

## Context
- Agents must call the five discovery ops (`claim_work`, `submit_candidate`, `enrich_candidate`, `list_candidates`, `promote_source`) from a Model Context Protocol runtime; humans need the same calls from a terminal/scripts.
- Constraints: Effect v4 everywhere; schema-first boundaries (I8 — no business logic in front-ends); agents and CLI must exercise identical code paths; must run headless in CI.
- Affects: `packages/source-catalog` front-end layers only. No change to the store seam (TDR-013) or the schema.

## Options considered
### Option A — stdio MCP via `@modelcontextprotocol/sdk`
- **Description:** Official MCP TypeScript SDK over stdio transport; a thin handler maps each tool to `SourceCatalogService`.
- **Pros:** First-party protocol support; drop-in for Claude Code, `mcp-agent`, etc.; Effect-free boundary kept trivial; no server infra.
- **Cons:** New dependency; SDK is protocol-version-coupled (must track MCP spec).

### Option B — Custom Effect HTTP/JSON-RPC server + separate CLI
- **Description:** Roll our own RPC over HTTP, plus a CLI.
- **Pros:** No new dependency; full Effect typing.
- **Cons:** Reimplements MCP (large); no out-of-the-box agent integration; more surface to maintain; violates schema-first boundary benefit.

### Option C — CLI only
- **Description:** Ship only a CLI; agents call it via subprocess.
- **Pros:** Zero new deps.
- **Cons:** Agents get no native MCP tooling; no structured result protocol; weak fit for the agent-centric harness (the entire point).

## Evaluation criteria
1. Fit with Effect/schema-first architecture
2. Agent/runtime interoperability (MCP ecosystem)
3. Ecosystem maturity & maintenance
4. Integration effort / learning

## Analysis
- Option A wins on interoperability (2) — MCP is the de-facto agent tool protocol; Claude Code and other runtimes speak it natively. Its main cost (a new dependency, option-1 cons) is contained because the handler stays an ~empty mapping onto `SourceCatalogService`, so no business logic leaks (I8) and it is trivially faked/testable. The schema-first boundary (I6) is preserved: tool inputs/outputs are `SourceCandidate`/`WorkUnit`-encoded.
- Option B gives typing but abandons the ecosystem (2) and adds maintenance (4). Option C fails the harness's core purpose (agent-first, 2).
- Risk: SDK/protocol drift — mitigated by pinning the SDK version and keeping the protocol surface to the five ops.

## Recommendation
- **Option A:** `@modelcontextprotocol/sdk` (stdio) for agents + a minimal `cli.ts` for humans, both delegating to `SourceCatalogService`. Same five ops on both. Use the **v1 line (1.30.x)** — mature, broadly adopted (Claude Code et al.) — over the newer v2 packages (`@modelcontextprotocol/server`) which shipped alongside the 2026-07-28 spec and are still settling.
- **What would change this decision:** Effect shipping a first-class, maintained MCP server that removes the SDK dependency without losing interoperability; v2 stabilizing and becoming the clear default; or evidence that MCP adoption collapses in favor of another agent protocol.

## Open questions
- None blocking; transport packaging (single stdio process) is decided.

## References
- `openspec/changes/source-discovery-harness/{proposal,design}.md`
- TDR-013 (store seam); CONTRACT.md I8 (no logic in front-ends), I6 (schema boundaries)
