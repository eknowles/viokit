# Tasks — Monorepo Sections

> Pure move: no behavior change, so the proof is that every existing suite and typecheck passes
> unchanged. No TDR (no new dependency).

## 1. Move

- [x] 1.1 `git mv viokit-site apps/site`; rename the package to `@viokit/site`.
- [x] 1.2 `git mv packs packages/packs`.
- [x] 1.3 Move `packages/tsconfig.base.json` to the repo root.

## 2. Rewire

- [x] 2.1 Root `package.json`: workspaces become `apps/*` + `packages/*`; retarget the four scripts filtered on `viokit-site`.
- [x] 2.2 Repoint every package's `tsconfig.json` `extends` at the root base config.
- [x] 2.3 Update root `tsconfig.json` and `biome.jsonc` globs.
- [x] 2.4 `bun install` to relink the workspace.

## 3. Verify

- [x] 3.1 Every package typechecks with no new errors.
- [x] 3.2 Every suite passes with the same counts as before the move.
- [x] 3.3 `npm exec -- ultracite check` clean.
- [x] 3.4 Update the path references in `docs/` that name the old locations.
