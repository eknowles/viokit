## 1. Rules and configuration

- [ ] 1.1 Add `conformance/rules/no-direct-io.grit` and `no-io-imports.grit` from the spike, without `Bun.serve`; verify each flags its planted case and passes a clean file
- [ ] 1.2 Register the plugins and the allowed paths in `biome.jsonc`; verify `npm exec -- ultracite check` passes on the current tree and that the transports are excluded (the spike could not confirm path exclusion)

## 2. Positive control

- [ ] 2.1 Add a violating fixture under `conformance/fixtures/` that is excluded from the normal lint but included in the control run; verify the control run reports it
- [ ] 2.2 Add a test that runs Biome on the fixture and fails if no plugin diagnostic is reported; verify it fails when a rule is deliberately broken and passes otherwise

## 3. Held-out guard

- [ ] 3.1 Write `conformance/guard.sh`: given a base ref, fail on any modified or deleted file in the protected set (conformance directory, `biome.jsonc`, existing test files, `openspec/specs/**`) and allow new test files; verify with a temporary repository covering an edited rule, a deleted test, an added test, and an unrelated change
- [ ] 3.2 Document how the orchestrator runs the guard from the base ref (`git show <base>:conformance/guard.sh`); verify by running it that way against a branch that edits the guard

## 4. Wiring and docs

- [ ] 4.1 Add a `conformance` script to `package.json` and include the control test in `bun test`; verify the standard check command runs both
- [ ] 4.2 Update `CONTRACT.md` to name the checks as the enforcement of I4 and I10, with the known evasions; verify the references resolve
- [ ] 4.3 Run `npm exec -- ultracite check`, `tsc --noEmit` and the workspace tests; verify all are green and no runtime file changed (`git diff --stat` shows only the files listed in the proposal)
