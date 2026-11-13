## 1. Skeleton and configuration

- [ ] 1.1 Create `scripts/deliver/` with the entry point, a typed configuration (agent command, integration branch name, model names, caps, retries, paths) and the `deliver` script in `package.json`; verify `bun run deliver --help` prints usage and `ultracite check` passes
- [ ] 1.2 Add a stub agent executable for tests that edits a file, commits, and prints canned JSON, with modes for success, a failing edit, and malformed output; verify each mode with a direct run

## 2. Claim, worktree, and dry run

- [ ] 2.1 Implement the exclusive claim by atomic directory creation, with release on exit; verify two concurrent attempts yield exactly one winner and the loser reports the holder
- [ ] 2.2 Implement worktree and branch creation from the integration branch under a gitignored path, creating the integration branch from main when absent; verify in a temporary repository that the branch starts at integration's tip
- [ ] 2.3 Implement dry-run mode that prints every command and changes nothing; verify the repository state is identical before and after

## 3. Author and gates

- [ ] 3.1 Run the author with the allow list, caps and `--permission-prompts none`, injected command; verify against the stub that the exact flags are passed and that push is not in the allow list
- [ ] 3.2 Run the gates in order (check, tests, guard from the integration copy), stopping at the first failure and capturing its output; verify a failing test fails the run even when the stub reports success, and that an edited guard is judged by the original
- [ ] 3.3 Implement bounded retries that pass the failing output back to the author; verify a stub that fixes on the second attempt succeeds and one that never fixes fails after the last retry with the branch kept

## 4. Reviewer and merge

- [ ] 4.1 Run the reviewer as a separate process with read-only tools, a different model and a JSON verdict schema; verify an unparseable answer and a high-severity finding both block the merge, and that its command line has no edit tools
- [ ] 4.2 Merge a passing branch into the integration branch with a no-fast-forward merge in a dedicated worktree under a lock, never touching main; verify main's tip is unchanged and integration gains one merge commit
- [ ] 4.3 Write the per-run record, including failure output; verify a failed run's record names the gate

## 5. Close out

- [ ] 5.1 Update `docs/PROJECT_PICTURE.md` decision 11 to say what was built and what the spike changed; verify the file formats cleanly
- [ ] 5.2 Run `bun run check` and the new tests, and confirm no runtime package changed; verify with `git diff --stat`
