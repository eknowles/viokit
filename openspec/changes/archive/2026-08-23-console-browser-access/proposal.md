# Console Browser Access

## Why

The console could not reach the engine from a browser at all. It runs on a different port from the API — Vite on 5173, the API on 4000 — so every call is cross-origin, and a POST carrying JSON is preflighted. The HTTP surface answered no preflight (`OPTIONS` fell through to 404) and sent no `Access-Control-Allow-Origin`, so the browser blocked every request and the console showed "Failed to fetch".

**The defect survived because of how it was verified.** Every live check of the HTTP surface used server-side Bun scripts and `curl`, neither of which is subject to CORS. The tests exercised the handler directly, which is not either. Nothing in the loop ever opened a browser, so a surface built specifically for a browser was never tried from one.

## What Changes

- **The surface answers preflight requests** and carries CORS headers on every response, including failures — otherwise the browser blocks the response and the console reports a network error instead of the engine's actual message.
- **Loopback origins only.** `*` would mean any page in any tab could drive an investigation the moment this server were bound beyond localhost, and it is unauthenticated by design until governance.
- **Regression tests** covering preflight, loopback acceptance, non-loopback refusal, no-origin requests, and headers on error responses.

## Capabilities

### Modified Capabilities

- `agent-integration`: the HTTP surface is reachable from a browser at a different origin, restricted to loopback.

## Impact

- `packages/agent`: preflight handling and CORS headers on the HTTP adapter.
- Tests: five regression cases, exercising the handler with `Origin` headers as a browser sends them.
- No engine, schema, or console changes — the console's code was correct; it was being blocked before it reached the network.
