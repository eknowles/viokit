# @viokit/agent

Three front-ends over one operation table, so agents, humans, and browsers drive the engine through
identical paths with no privileged bypass (I8). Adding an operation to `src/operations.ts` adds it to
all three at once.

| Surface | Entry point | For |
|---|---|---|
| MCP (stdio) | `bun --bun src/mcp.ts` | agent runtimes (TDR-016) |
| CLI | `bun --bun src/cli.ts <operation> --flag value` | humans and scripts (TDR-016) |
| HTTP | `bun --bun src/http.ts` | browsers and local tooling (TDR-017) |

## HTTP

```
GET  /operations              every operation, with its arguments
POST /operations/:name        run one; JSON body carries the arguments
```

Statuses are answerable without reading the body: `200` success, `400` the payload failed to decode,
`404` no such operation, `422` the operation itself failed (the body carries its error `tag`).

```sh
VIOKIT_HTTP_PORT=4000 bun --bun packages/agent/src/http.ts

curl -s localhost:4000/operations
curl -s -X POST localhost:4000/operations/catalog_list \
  -H 'content-type: application/json' -d '{"kind":"source","runnable":true}'
```

Configuration: `VIOKIT_HTTP_HOST` (default `127.0.0.1`), `VIOKIT_HTTP_PORT` (default `4000`),
`VIOKIT_EVIDENCE_DIR` and `VIOKIT_GRAPH_DB` for durable evidence and graph storage.

> **The HTTP surface is unauthenticated.** It binds to loopback and must not be exposed beyond the
> local machine until governance (P4) lands.

## Credentials

Credential-gated sources name a secret; the value never lives in a pack (TDR-018).

```ts
// in a pack's sources.ts
auth: { scheme: "bearer", secretRef: "SHODAN_KEY" }
auth: { scheme: "header", name: "x-api-key", secretRef: "SECURITYTRAILS_KEY" }
auth: { scheme: "query",  name: "api_key",   secretRef: "ACLED_KEY" }
```

Provide the value in the environment: `SHODAN_KEY=… bun --bun packages/agent/src/http.ts`. A
reference that does not resolve — including one exported as an empty string — makes the source
report as **not runnable**, with the reference named, so the catalog stops promising a source whose
key is absent. Resolution happens inside the runtime; credentials never reach a transform, a
front-end, the cache fingerprint, stored evidence, or an error message.

## Browser sources

Sources declaring `transport: "browser"` are driven through headless Chrome (`Bun.WebView`,
TDR-019), bound to the egress route the runtime resolved and isolated per identity by profile
directory. Requires **Bun 1.4** and a Chrome-family browser; a deployment that wires no browser
engine simply reports browser sources as blocked, which is the honest answer.

An acquisition that cannot be bound to its required proxy **fails** rather than quietly fetching
direct — a bypass would be invisible afterwards, because the evidence would still record `proxy`.

The live browser test is outside the default suite so it stays hermetic:

```sh
bun test ./packages/sources/test/browser-live.ts
```
