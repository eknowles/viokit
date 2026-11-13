## Why

The project is moving to delivery by parallel agents with no human reading each change. The pieces that make that safe now exist in part: invariant checks, a guard that stops an author weakening them, and OpenSpec changes that carry their own task lists. Nothing yet runs them together. Without an orchestrator the guard has no caller, and "an agent delivers a change" is a manual sequence of commands.

## What Changes

- Add a delivery script that takes one OpenSpec change and carries it to the `integration` branch with no human input: claim it, run an author agent in an isolated git worktree, run the gates, run an independent reviewer, and merge only if everything passes.
- The author is a headless Claude process with a spend cap, a turn cap, and permissions limited to an explicit allow list. It cannot push, and it never touches `main`.
- A failed gate sends the failure back to the author for a bounded number of retries, then the run stops and the branch is left for a person.
- The reviewer is a separate headless process with read-only tools and a different model, returning a structured verdict. It is a filter, not the gate.
- Every run writes a record: gate results, spend, turns, verdict, and outcome.
- A dry-run mode prints what would run without starting any agent, and the whole loop is tested against a stub in place of the real agent, so tests spend nothing.

Out of scope: running many changes at once (a follow-up adds a concurrency layer on top of this), cloud or scheduled runs, keeping the conformance rules out of the author's checkout, an aggregate budget across runs, and promoting `integration` to `main`, which stays a human action.

## Capabilities

### New Capabilities
- `delivery-orchestrator`: carrying one change from its task list to the integration branch through an author agent, mechanical gates, and an independent reviewer, with exclusive claims, caps, and a run record.

### Modified Capabilities

## Impact

- `scripts/deliver/`: the orchestrator and its stub-based tests. New directory.
- `package.json`: a `deliver` script.
- `.gitignore`: worktrees and run records.
- `docs/PROJECT_PICTURE.md`: decision 11 moves from proposed to built, with what the spike changed.
- No runtime change and no new dependency. It runs the `claude` command-line tool, which must be installed where it runs.
