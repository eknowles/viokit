## 1. The vocabulary

- [x] 1.1 Create `packages/vocabulary/` with typed entity kinds and relation types, each with a description, and a header attributing the SpiderFoot inspiration; verify a test shows every name is lower-case hyphenated and has a non-empty description, and that the four existing relations and two existing kinds are present
- [x] 1.2 Add a README stating the steward lane rules and how a tool agent requests a new name; verify `bun run check` is clean

## 2. The check

- [x] 2.1 Write the scanner in `conformance/vocabulary.ts`: find `kind: "…"` and relation literals in `packages/packs/*` outside the vocabulary pack, tests and dependencies, ignoring `passive` and `active`; verify unit tests cover an unknown kind, an unknown relation, an exec classification (not flagged), and a known name (not flagged)
- [x] 2.2 Add a violating fixture and a control test that fails if the scanner stops flagging it; verify it fails when the scanner is broken on purpose and passes otherwise
- [x] 2.3 Run the scanner over the real packs and wire it into `bun run conformance`; verify the current packs pass and a planted unknown kind in a temporary pack file is reported with file and line

## 3. The guard

- [x] 3.1 Protect `packages/vocabulary/` in `conformance/guard.ts` and add the `--steward` flag that lifts only that directory; verify tests for a tool change that edits it (fails), a steward change that edits it (passes), and a steward change that edits a conformance rule (still fails)
- [x] 3.2 Make the orchestrator pass `--steward` only when the change name starts with `vocabulary-`; verify with the stub that a `vocabulary-x` change passes the flag and another change does not

## 4. Close out

- [x] 4.1 Run `bun run check` and the package and script tests; verify they are green apart from the known pre-existing `dispatch.test.ts` failure, and that no runtime source file changed
