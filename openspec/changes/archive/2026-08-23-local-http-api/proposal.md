# Local HTTP API

## Why

The engine is driveable by agents over MCP and by humans over a CLI, but not by a browser — and a browser console is the next thing to build. A local HTTP surface is the missing adapter, and it is also the "local deployable" story: one Bun process you start and point a browser at.

TDR-016 anticipated this ("the network surface becomes a third adapter over the same program layer"), and TDR-017 settles its shape: a generic route over the shared operation table rather than a statically declared API, so parity across front-ends stays a structural property rather than something a test has to defend.

## What Changes

- **An HTTP front-end in `packages/agent`**, beside the MCP and CLI adapters and built from the same `AgentProgramLayer`: one route dispatches any operation in the shared table, and one endpoint publishes the table itself so a client can discover the surface the same way it discovers the catalog.
- **A binary to run it**, so a local deployment is one command.
- **The parity guarantee extends to three surfaces.** The existing enumeration test grows to assert every operation is reachable over HTTP too — by construction, since all three read one table.
- Errors keep their meaning across the boundary: an operation that fails is an HTTP failure a client can distinguish from success, not a 200 carrying an error string.

Not in this change: real-time streaming (gated on TDR-003), authentication and authorization (P4 governance — this binds to loopback), and the console SPA itself, which is the next change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agent-integration`: the operations gain a third front-end, and the surface becomes self-describing over HTTP so a browser client can discover what it can call.

## Impact

- `packages/agent`: an HTTP adapter over the operation table, a `bin` entry to serve it, and configuration for host/port.
- Tests: every operation dispatchable over HTTP, unknown operations and malformed payloads rejected without touching engine state, failures distinguishable from successes, the discovery endpoint describing each operation's arguments, and three-way parity across MCP, CLI, and HTTP.
- No new dependency: `HttpRouter`/`HttpServer` ship in the `effect` package already in the tree.
- Binds to loopback by default — until governance lands, this surface is unauthenticated and must not be exposed beyond the local machine.
