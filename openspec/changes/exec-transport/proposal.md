## Why

Much of the OSINT toolbox is command-line tools (`dig`, `whois`, `nmap`, `subfinder`, and the rest of Kali). Today the only way to use one is to run it by hand and submit its output as evidence. The project's goal is for agents to wrap many such tools and grow an investigation tree from a seed, which needs a first-class way to run a tool as a source. Parameterised invocation already exists (`{name}` placeholders bound from transform input), so the missing piece is the transport.

## What Changes

- Add an `exec` transport that runs a command and returns its standard output as the acquisition's bytes, behind the same `SourceTransportService` seam as `http`, `dataset` and `browser`.
- Commands run through a **runner** seam with two implementations: `host` (a local process) and `container` (`docker exec` into a named running container). The deployment chooses; the container is the intended default, and the host runner covers development and tools installed locally. The sidecar image and its lifecycle are a separate change.
- A source declares an argument vector with `{name}` placeholders and a typed parameter list. Binding substitutes whole arguments and validates each value by its declared type (`domain`, `ip`, `cidr`, `url`, `integer`, `enum`, `token`). Any value starting with `-`, or containing a NUL or newline, is refused. No shell is involved and agents cannot supply raw flags.
- A command is limited by a timeout, an output size cap, and a deployment-wide concurrency limit. On timeout or cap the whole process group is killed, not only the direct child.
- Each source declares `kind: passive | active` as metadata. **Nothing is refused on the basis of kind.**
- `proxy` egress is refused for exec sources, as it was for browser sources before TDR-022.
- A command that cannot be found fails before running, naming the command.
- Prove it with `dig`: a `web-dns` source and a transform that projects its answer into domain and address entities, tested against captured output.
- Record the spike result in `design.md` before implementation, and write the decision up afterwards as a decision record.

Out of scope: wrapping MCP servers, replay of exec runs, pinning tool versions, the container image and its lifecycle, and the investigation tree.

## Capabilities

### New Capabilities
- `exec-transport`: running a command as a source through a host or container runner, with typed argument binding, resource limits, and a process-group kill.

### Modified Capabilities
- `source-runtime`: an exec source whose command cannot be found fails before running, and a deployment declares whether it provides the transport.

## Impact

- `packages/schema`: `Transport` gains `exec`; `SourceSpec` gains an optional `exec` block; `binding.ts` binds argument placeholders with typed validation.
- `packages/sources`: new exec transport and the two runners, wired into dispatch the way the browser transport is.
- `packages/engine`: the cache fingerprint includes the bound argument vector; runnability reads the exec declaration.
- `packages/agent`: the deployment declares `exec` among its transports and which runner it uses.
- `packages/packs/web-dns`: one `dig` source and one transform.
- No new dependencies. The conformance check exempts `packages/sources/src`, which is where the runners live.
