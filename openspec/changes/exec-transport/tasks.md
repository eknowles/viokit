## 1. Schema

- [x] 1.1 Add `"exec"` to `Transport` and an optional `exec` block to `SourceSpec` (command, args, params with types, timeoutMs, maxOutputBytes, kind, optional env); verify a decode test accepts a valid block and rejects a missing `kind` or an unknown param type
- [x] 1.2 Extend `binding.ts` to bind placeholders in `exec.args` element by element with typed validation, refusing values that start with `-` or contain NUL or a newline, and dropping undeclared input; verify tests cover a shell-metacharacter value (stays one argument), `-f/etc/passwd` and `--version` (refused), a wrong-typed value, a missing value, and an undeclared parameter

## 2. Runners and transport

- [x] 2.1 Implement the host runner: detached spawn, environment of `PATH` plus declared variables, throwaway working directory removed afterwards, counting reader with a size cap, timeout; verify a harmless command's arguments arrive intact and a parent secret is not visible
- [x] 2.2 Kill the whole process group on timeout and on cap; verify with a command that ignores termination and starts a child (ends in under two seconds, no process left) and with a command that floods output
- [x] 2.3 Treat a non-zero exit as failure with the status and a bounded stderr excerpt, recording nothing; verify with a command that exits 2
- [x] 2.4 Implement the container runner as `docker exec` with an array, an explicit working directory and declared environment; verify the exact command line built, an error naming the container when it is not running (using a fake docker executable), and an opt-in live test gated on `VIOKIT_EXEC_CONTAINER`
- [x] 2.5 Add a deployment-wide concurrency permit; verify more acquisitions than the limit never exceed it
- [x] 2.6 Refuse `proxy` egress before starting anything; verify no process is started

## 3. Runtime and wiring

- [x] 3.1 Include the bound `exec.args` in the cache fingerprint; verify two inputs to one source produce two cache entries and credentials remain stripped
- [x] 3.2 Route `exec` in the dispatch transport, present only where the deployment provides it; verify a deployment without it reports exec sources as not runnable with the reason
- [x] 3.3 Fail before running when the command cannot be found, naming it; verify with a source whose command does not exist
- [x] 3.4 Declare `exec` and the chosen runner in the agent deployment and show `kind` in the runtime catalog; verify the catalog lists an exec source with its kind and runnable state

## 4. First tool: dig

- [x] 4.1 Add a passive `dig` source to the `web-dns` pack and register it; verify the pack conformance test still passes
- [x] 4.2 Add a transform projecting `dig` answer lines into domain, address and `resolves_to` operations attributed to the run's evidence; verify a fixture test from captured `dig` output yields the expected entities and relations, and an empty answer yields none
- [x] 4.3 Add one end-to-end test that runs real `dig` and is skipped when `dig` is absent; verify it passes here (dig is installed) and reports a skip otherwise

## 5. Close out

- [x] 5.1 Run `bun run check`, `tsc --noEmit` and the package tests; verify the conformance check passes (the runners live in the exempt `packages/sources/src`) and the tsc error count has not risen above 85
- [x] 5.2 Walk invariants I1 to I12 for this change and record which were relaxed; verify the checklist is in the final commit message
