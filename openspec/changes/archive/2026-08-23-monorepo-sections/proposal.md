# Monorepo Sections

## Why

The repo has grown a UI-shaped requirement — a local deployable HTTP API and a console SPA — and the current layout has no place to put either. `packages/*` holds libraries, but `viokit-site` sits loose at the root as a sibling of `packages/` and `packs/`, so there is no section that means "a thing you open in a browser". Adding a console SPA next to it would entrench that.

Fixing the layout before the HTTP adapter and the console land is cheaper than moving them afterwards, and it is a pure move: no behavior changes.

## What Changes

- **`apps/`** — browser-facing applications. `viokit-site` becomes `apps/site` and is renamed `@viokit/site` to match the workspace's naming; the console SPA will land as `apps/console`.
- **`packages/`** — everything else: engine libraries, front-ends, and domain packs. `packs/` becomes `packages/packs`.
- **`tsconfig.base.json` moves to the root.** It currently lives in `packages/` while `packs/` reaches across into it — with two sections that only gets worse, so the shared base belongs where both sections can see it.
- Workspace globs, tooling globs, and the root scripts that reference `viokit-site` are updated to match.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None — this is a layout and tooling change with no spec-level behavior change, so the change declares `skip_specs: true`.

## Impact

- `package.json`: workspaces become `apps/*` and `packages/*`; the four scripts filtered on `viokit-site` are retargeted.
- `tsconfig.json`, `biome.jsonc`: include globs follow the moves.
- Every package's `tsconfig.json`: `extends` repointed at the root base config.
- Import specifiers are unaffected — packages are referenced by name (`@viokit/packs`, `@viokit/schema`), not by path.
- Verification is the existing suites and typechecks passing unchanged; a pure move should be invisible to them.
