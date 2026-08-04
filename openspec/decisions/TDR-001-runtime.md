# TDR-001 — Runtime: Bun vs Node vs Deno

- **Status:** decided
- **Owner:** Viokit core
- **Date:** 2026-08-04
- **Related:** `ROADMAP.md` P0; `STAGED_BUILD.md` Stage 0; invariants I6; exploration `01/03`

## Decision summary
> Adopt **Bun** as the primary runtime and package manager, with **Node.js** kept as a drop-in via the Effect platform's cross-runtime support.

## Context
- The engine must run standalone (local, single-user) and, later, on K8s/Compose in shared topologies.
- The stack is Effect v4 + Effect Schema everywhere; the runtime must run the same schema and code paths on CLI, API, MCP, and (via the client) in the browser.
- The repo already standardizes on Bun: `bun.lock`, `bun run --filter` scripts, and Bun package-manager workspaces.
- Choosing the runtime early matters because the toolchain, `effect-ts` skill setup (`.repos/effect`), and the engine's concurrency model all depend on it.

## Options considered
### Option A — Bun
- **Description:** Bun as runtime + package manager.
- **Pros:** fastest cold start; native TypeScript (no separate build step for dev); first-class Effect platform support; already the repo's toolchain; single package manager for workspace + tests.
- **Cons:** ecosystem edge-cases; must pin compatible versions with the Effect beta set; some native modules lag Node.

### Option B — Node.js
- **Description:** Node as the primary runtime, npm/pnpm manager.
- **Pros:** maximum ecosystem maturity; strongest deployability story; battle-tested on K8s.
- **Cons:** TypeScript requires a build/loader step; slower start; would migrate the existing Bun workspace.

### Option C — Deno
- **Description:** Deno runtime.
- **Pros:** secure by default, built-in TS.
- **Cons:** smallest Effect-platform footprint; least alignment with the existing repo; weakest fit for the target libraries (React client, Arrow).

## Evaluation criteria
1. Fit with the Effect/schema-first architecture
2. Toolchain alignment with the existing repo
3. Ecosystem maturity & maintenance
4. Performance / start-up behaviour
5. Ops & deployment cost (standalone → K8s)
6. Effort to integrate / learn

## Analysis
- **Fit (1):** Effect v4 + Effect platform runs first-class on Bun; this is the strongest criterion and Bun and Node both satisfy it. Deno is weakest.
- **Toolchain (2):** Bun wins decisively — the repo is already a Bun workspace; switching would be pure rework, contradicting the staged-build goal of minimal change.
- **Maturity (3):** Node wins, but Bun's gap is narrowing and confined to niche native modules the core does not need.
- **Performance (4):** Bun wins on start-up, which matters for CLI/MCP cold paths.
- **Ops (5):** Node has the edge on large K8s fleets, but Bun 1.x is container-ready; the runtime is abstracted by Effect platform so containers can run either.
- **Effort (6):** Bun requires zero migration; Node would require porting the workspace.

Trade-off made explicit: we accept a slightly narrower ecosystem window in exchange for toolchain alignment and speed. Because the Effect platform abstracts the runtime, this is a **soft** choice — a later flip to Node is a container/toolchain change, not an engine rewrite.

## Recommendation
- **Chosen:** Bun, primary runtime + package manager. Node remains a supported drop-in for deployment where required.
- **What would change this decision:** a demonstrated Effect-platform incompatibility on Bun, or a production requirement for a Node-only native dependency. Either would be re-evaluated via a superseding TDR, not a silent change.

## Open questions
- Pin the exact `effect@beta` aligned dependency set before Stage 0 implementation.

## References
- `ROADMAP.md` P0; `STAGED_BUILD.md` Stage 0; `openspec/decisions/README.md` TDR-001 row.
