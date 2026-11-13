## Context

`docs/PROJECT_PICTURE.md` decision 11 proposes a plain orchestrator script. The research recommended a script or SDK program over a Workflow or agent teams, because it must run headless and reproducibly. The pieces it joins already exist: OpenSpec changes with `tasks.md`, `bun run check`, the held-out guard in `conformance/guard.ts`, and a headless `claude -p` process. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- One change in, one merged branch or one kept failure out, with no human step between.
- A loop that is fully testable without spending money or calling a model.
- Failures that are loud and recorded rather than silent.

**Non-Goals:**
- Parallelism across changes, scheduling, cloud runs.
- Hiding the conformance rules from the author.
- Judging the quality of the author's design. The gates and the reviewer filter; they do not certify.

## Spike

The `claude` command is not installed on the development machine this change was written on, so no real run was possible. The flags were checked against the official CLI reference, headless and permission-mode pages, read on 2026-11-13.

| Question | Result |
|---|---|
| Is there a spend cap for a headless run? | **Yes**, `--max-budget-usd`: "stop the run once estimated spend on API calls reaches this amount (print mode only)". It is a client-side estimate and spend can pass the cap. Subagent spend counts. |
| Is there a turn cap? | **Yes**, `--max-turns`, print mode only. What happens when it is reached is **not documented**. |
| What does `dontAsk` do? | "Anything that would prompt is denied"; allow rules and `--allowedTools` still run. Valid modes: `default`, `acceptEdits`, `plan`, `auto`, `dontAsk`, `bypassPermissions`, `manual`. |
| Can prompts be disabled outright in headless mode? | **Yes**, `--permission-prompts none` (v2.1.259 and later): they are denied instead. |
| How are Bash allow rules written? | Prefix match with a space before the star: `Bash(git diff *)`. `Bash(git diff*)` would also match `git diff-index`. The `bun test *` form is extrapolated, not a documented example. |
| What does `--output-format json` return? | `session_id`, `result`, `total_cost_usd` are documented. `num_turns` and `is_error` are **not documented**. `--json-schema` puts validated output in `structured_output`. |
| Exit code when a cap is hit? | **Not documented.** Success is 0 and failure is non-zero; SIGTERM is 143. |
| Which branch does `--worktree` start from? | **Not documented.** |

Consequences: the orchestrator creates worktrees itself with `git worktree add` from the integration branch rather than relying on `--worktree`, and it never infers success from the author's exit code or fields it cannot rely on. Gates are the only truth.

Not verified by running: any real author or reviewer run, and whether the allow list is sufficient for an author to complete a real change. The first real run is the test of that, which is why the stub exists and why the first run should be a small change.

## Decisions

### 1. A plain Bun script, not a Workflow
The script is reproducible, readable, and runs under cron or CI. A Workflow adds token cost and cannot be tested against a stub. Parallelism is added later by running this script more than once.

### 2. The agent command is injectable
The script takes the agent executable from configuration, so tests point it at a stub that edits files and prints canned JSON. This is what makes the loop testable and free.

### 3. Worktrees are created by the script
`git worktree add -b agent/<change> <path> integration`. Paths sit under a gitignored directory. This does not depend on the undocumented base-branch behaviour of `--worktree`.

### 4. Claims are atomic directory creation
`mkdir` of a claim directory succeeds for exactly one caller. The claim records the process and start time. A stale claim is reported, not stolen: breaking one is a human decision.

### 5. Permissions are an explicit allow list under `dontAsk`
The author may read, edit and write, and run `git add`, `git commit`, `bun test`, `bun run check`, and the OpenSpec commands. Everything else is denied, including `git push` and `git checkout main`. `--permission-prompts none` is set so nothing waits for an answer. This is a decision about the orchestrator's own command line; no settings file is changed.

### 6. Gates run in the author's worktree, the guard from integration
`bun run check`, then the tests, then the guard written out from `git show integration:conformance/guard.ts`. Order is cheapest first. Any failure ends the attempt.

### 7. Retries carry the failure
On a failed gate the author is run again with the failing output in its prompt, up to two retries. After that the run fails and keeps the branch.

### 8. The reviewer is a fresh process with read-only tools and a different model
It receives the diff and the change's specs, has no edit tools, and must return JSON matching a schema (`approve`, `findings` with severity). An unparseable answer counts as not approved. Because the evidence that a reviewer catches defects is weak, a reviewer approval is necessary but never sufficient: the gates run first and decide alone whether a change can merge.

### 9. Merge is a no-fast-forward merge into a dedicated integration worktree
This keeps one commit per delivered change on integration, makes a revert a single action, and never touches the main checkout.

### 10. The run record is JSON on disk
One file per run under a gitignored directory: change, outcome, attempts, gate output, spend and turns where reported, verdict. Fields the agent does not report are recorded as absent.

## Risks / Trade-offs

- **The allow list may be too tight or too loose for real work** → the first real run is a small change, and denials appear in the record. Tightening is cheap; loosening needs a person.
- **Spend can exceed the cap, and the cap's behaviour at the limit is undocumented** → gates run on whatever exists afterwards; a per-run cap is set low; an aggregate cap is a follow-up.
- **The reviewer over-flags or under-flags** → it is only a filter; its recall is to be measured with seeded defects in a later change.
- **A stale claim blocks a change** → reported with its age; a person removes it.
- **The author can edit the orchestrator in its own branch** → harmless to the run, since the orchestrator runs from the integration copy, and the guard's protected set can list `scripts/deliver/` later.
- **Nothing here stops two runs from conflicting on integration** → merges are serialised by taking a lock around the merge step; a conflicting merge fails the run and keeps the branch.
