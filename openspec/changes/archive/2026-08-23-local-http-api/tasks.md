# Tasks — Local HTTP API

> Prereq: TDR-017 `decided`. No new dependency — `HttpRouter`/`HttpServer` ship in `effect`.

## 1. HTTP adapter

- [x] 1.1 Add the HTTP front-end to `packages/agent`, built from `AgentProgramLayer` like the other adapters and holding no behavior of its own.
- [x] 1.2 Dispatch route: invoke any operation in the shared table by name, decoding its payload at the boundary (I6).
- [x] 1.3 Discovery endpoint: publish every operation with its description and argument declarations.
- [x] 1.4 Map outcomes to HTTP: success, decode failure, unknown operation, and operation failure each answerable without reading the body.

## 2. Serving it

- [x] 2.1 A `bin` entry that serves the surface, host and port configurable, bound to loopback by default.
- [x] 2.2 Document that the surface is unauthenticated until governance lands, and must not be exposed beyond the local machine.

## 3. Tests

- [x] 3.1 Every operation dispatchable over HTTP against a real engine layer, exercising a full loop (list the catalog, run a transform, commit, query).
- [x] 3.2 Unknown operation refused; malformed payload rejected with engine state unchanged; an operation failure reported as a failure.
- [x] 3.3 The discovery endpoint lists every operation, and a payload built from a declaration alone is accepted.
- [x] 3.4 Three-way parity: the operation sets exposed by MCP, CLI, and HTTP are equal.

## 4. Verification

- [x] 4.1 Typechecks and every suite green; `npm exec -- ultracite check` clean.
- [x] 4.2 Start the server and drive one real end-to-end request from outside the process.
- [x] 4.3 Invariant checklist, with I6 and I8 called out.
