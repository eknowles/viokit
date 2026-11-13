# Viokit — Session Memory (2026-11-14)

> Handoff for the next session. Read `docs/PROJECT_PICTURE.md` first (decisions 1–12), then this.
> Live build board (claude.ai artifact, owner-private): https://claude.ai/artifact/VbUM3DbRAZfevP3ayEKxbi
> — updated via the ArtifactData tool (collections `board/now`, `phases`, `caps`, `log`).

## State

- **Branch:** `main`, pushed to `origin/main`. Includes whois/nmap wrappers,
  relatedness tie-break fix, the whole investigation tree, this note.
- **Tag:** `v0.1.0-tdr-gated` (pushed) marks the old human-gated state.
- **Delivery model:** TDR gate replaced by spike-before-adopt (`.agents/skills/viokit-build/SKILL.md`).
  Every change goes through OpenSpec (`openspec/changes/<name>`), spike recorded in `design.md` first.

## Working agreements (copied from machine-local Claude memory)

- The user replies tersely ("y", "you decide"): pick the recommended option, say which, keep going.
- Commit and merge locally freely; **push only when the user says "push"** (fast-forward main is fine).
  Scan the range for secrets first.
- Keep the build board updated as work lands (log entries `log/l<N>`, last was `l21`), and refresh
  this note when context runs low.

## Built this session (all on main)

| Piece | Where | Notes |
|---|---|---|
| I4/I10 conformance + held-out guard | `conformance/` | `bun run check` runs it. Guard is run from the base branch's copy. |
| Delivery orchestrator | `scripts/deliver/` | Stub-tested only — `claude` CLI not installed on this machine. |
| exec transport | `packages/sources/src/exec*.ts` | Typed argv binding, host + container runners, group kill, container `timeout -s KILL`. |
| Kali sidecar | `sidecar/Dockerfile`, `scripts/sidecar.ts` | `bun run sidecar build\|up\|down\|status`, then `export VIOKIT_EXEC_CONTAINER=viokit-tools`. |
| Shared vocabulary | `packages/vocabulary/` | 10 kinds, 13 relations; conformance fails packs using other names; `--steward` guard flag. |
| Tools | `packages/packs/web-dns/{whois,nmap,graph}.ts` | dig, whois (passive), nmap (active, `-sT`). |
| Investigation tree | `packages/engine/src/tree.ts`, `run-log.ts` | `tree_expand` / `tree_show` on CLI/MCP/HTTP. Deterministic done-criterion test: 79 entities, 6 kinds. Live passive `nmap.org`: 16 entities. |

## Next (in order)

1. **whois on registrable domains** — it returns "Malformed request" for subdomains (9/10 runs empty in the
   live `nmap.org` tree). Needs public-suffix data → spike first.
2. First real orchestrator run (needs `claude` installed), on a small change.
3. Parallel runs in the expander; tool-catalog harness for agents; conformance for I2/I6/I1/I5/I8.

## Gotchas learned

- Run package tests with `npx vitest run` inside the package; `bun test` only for `scripts/` and `conformance/`.
- `openspec` isn't on PATH: use `npx --yes @fission-ai/openspec`.
- Pre-commit (lefthook) runs `ultracite fix` and **blocks** on lint errors — check `git log` after committing.
- Mutation-check new tests: twice this session tests passed because they never ran or didn't pin a boundary.
- Known pre-existing failure: `packages/sources/test/dispatch.test.ts` "uses the browser engine…".
- TypeScript 7 has no JS compiler API; Biome GritQL plugins are the static-check tool.
- `docker rm` on a shell variable is blocked by a safety check; use `--rm` containers that exit themselves.
- Live runs: `kinds: ["passive"]` avoids scanning third parties pulled in by whois (user's default is both).
- Effect pinned at 4.0.0-beta.103: no `Effect.catchAll`; use `Effect.result` to capture failures.
