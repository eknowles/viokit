## Context

The acquisition pipeline is owned by `SourceRuntime` (retry, rate limit, cache, egress, credentials). Transports sit behind one seam, `SourceTransportService.fetch(source, context)`, and a dispatch transport picks `http`, `dataset` or `browser` from `source.transport`. The browser transport is the precedent: optional, wired only where a deployment provides it, serialised by a runtime-held permit, and it refuses a route it cannot honour (TDR-019, TDR-022).

Parameterised invocation exists: `bindSource` substitutes `{name}` in `source.url`, percent-encoded, and fails with `UnboundParameter` on a missing value. The cache fingerprint hashes the url. An exec source has no URL worth hashing, so it needs its own identity.

Project decisions that shape this change (`docs/PROJECT_PICTURE.md`): tools run in a container sidecar; active tools are not refused; typed input validation replaces a bare leading-dash check; the conformance check exempts `packages/sources/src`, where the runners live. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Run one command as a source, safely enough that agents can add tools without reviewing each for injection.
- Keep execution inside the runtime's transports so no transform, pack or UI starts a process (I4).
- Prove it with `dig` and a fixture, with no dependency on the binary in the unit tests.

**Non-Goals:**
- The container image, its lifecycle and networking (a separate change).
- Routing a command's traffic through a proxy.
- Streaming output, interactive tools, or tools that write files instead of standard output.
- Tool versions in evidence, and replay.

## Spike

Run 2026-11-13 with Bun 1.4.0 on Linux. `dig` is installed; `whois` is not; no Kali image is present.

| Question | Result |
|---|---|
| Does an argument array keep a hostile value as one argument? | **Yes.** `echo "a b; touch /tmp/PWNED $HOME 'q'"` printed the value verbatim and created no file. |
| Is option injection real despite the array? | **Yes.** `ls --version` as a value printed the version banner: a value starting with `-` is parsed as an option. A shell-free array does not stop this, so typed validation and a leading-dash refusal are required. |
| Does killing the direct child end a command? | **No.** `sh -c "trap '' TERM; sleep 30 & sleep 30"` killed at 500 ms took **30002 ms** to finish reading, because orphaned children kept the output pipe open. |
| Does a process-group kill fix it? | **Yes.** With `detached: true` and `process.kill(-pid, "SIGKILL")` the same command ended in **502 ms** with exit 137, and no leftover process. |
| Does a capped reader stop a flood? | **Yes.** Reading `yes` with a 1 MB cap stopped at 1,310,720 bytes in **5 ms**, killing the group. |
| Is the parent environment hidden? | **Yes.** With `SECRET_TOKEN` set in the parent and an environment of only `PATH`, the command printed `unset`. |
| Does `dig` give parseable output? | `dig +noall +answer <name> A` writes one record per line: name, TTL, class, type, data. Confirmed by running it. |
| Can the container runner be proven here? | **Partly.** Docker 27.3.1 is installed but no Kali or minimal image is present and pulling one is outside this change. The container runner is verified by the exact command line it builds; a live test runs only when `VIOKIT_EXEC_CONTAINER` names a running container. |

Not verified: that the container runner works end to end against a real container, and `whois` parsing.

## Decisions

### 1. `exec` is a fourth transport, selected by `source.transport`
`Transport` gains `"exec"`, and `SourceSpec` gains an optional `exec` block: `{ command, args, params, timeoutMs, maxOutputBytes, kind, env? }`. Dispatch routes to it as it routes `browser`, and refuses with a reason where the deployment does not provide it.

*Alternative: a service beside `SourceRuntime`.* Rejected: it would bypass retry, rate limit, cache and egress, making exec the first transport that does (I4).

### 2. A `CommandRunner` seam with `host` and `container`
`run(argv, { cwd, env, timeoutMs, maxOutputBytes }) -> { stdout, status }`. The host runner spawns a detached process; the container runner builds `docker exec --workdir <dir> [-e K=V ...] <container> <argv...>` and runs that through the same host machinery. Timeout and cap handling live once, above the runner.

*Alternative: container only.* Rejected: unit tests and local development need a runner that does not require a container, and the container runner needs the same limit handling anyway.

### 3. Arguments are an array; placeholders fill whole elements
`exec.args` is an array of strings. A placeholder is replaced inside one element and never split, quoted or joined.

### 4. Typed parameters, a leading-dash refusal, and no undeclared input
Each placeholder names a parameter with a type: `domain`, `ip`, `cidr`, `url`, `integer`, `enum` (a fixed list), or `token` (letters, digits and a few safe symbols). The value is checked against that type, and any value starting with `-` or containing NUL or a newline is refused. Input parameters the source does not declare are dropped, and agents cannot pass raw flags. The spike showed the dash check is not optional.

*Alternative: prepend `--` automatically.* Rejected: not every tool honours it, and silently inserting it changes the command.

### 5. The url is a derived identity; the fingerprint includes the argument list
Exec sources set `url` to `exec:<command>`. The cache fingerprint adds the bound `exec.args` when present, so two inputs never share an entry. Credentials are still stripped.

### 6. Standard output is the evidence; a non-zero exit is a failure
Bytes are stdout, content type `text/plain`. A non-zero exit fails with the status and a bounded stderr excerpt and records nothing.

### 7. Limits: a process-group kill and a capped reader
The command starts detached, so it leads its own process group. On timeout or cap the group is killed. Output is read through a counting reader that stops at the cap. The spike shows both are needed. The concurrency limit is a deployment-wide permit like the browser gate; the per-source `rateLimit` still applies in front of it.

### 8. Clean environment and working directory
The host runner passes only `PATH` plus variables the source lists in `exec.env`, and uses a fresh temporary directory removed afterwards. The container runner passes the same through `docker exec`. Hygiene against accidents, not isolation.

### 9. `kind` is metadata
Required on every exec source and shown in the catalog, but never used to refuse an acquisition (project decision 3). A later change can attach policy to it.

### 10. Proxy egress is refused
A command's traffic leaves by its own route and the runtime cannot bind it. Claiming `proxy` in evidence while traffic went direct is the I10 failure TDR-022 exists to prevent, so exec refuses `proxy` and accepts `direct`.

### 11. The first tool is `dig`, tested from a fixture
`dig +noall +answer {domain} A` as a passive `web-dns` source, with a transform that projects answer lines into a `domain` entity, address entities and `resolves_to` relations, attributed to the run's evidence (I2). The projection is tested from captured output; one live test runs the real `dig` and is skipped when it is absent.

## Risks / Trade-offs

- **Option injection through a tool that legitimately takes a leading-dash value** → refused in v1 with a clear error; revisit per tool.
- **No real sandbox on the host runner; the container is the isolation** → the host runner is for development; the design says so, and the default deployment uses the container.
- **The container runner is verified only by its command line here** → a live test is opt-in; the first real container run is the test of it.
- **Output formats drift between tool versions** → fixtures pin what a parser expects; version recording is out of scope.
- **Active tools reach real targets with no scope** → a deliberate project decision; recorded here so it is not a surprise.
- **Process leaks** → the group kill covers timeout and cap; a test starts a child that ignores termination.
