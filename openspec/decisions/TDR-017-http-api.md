# TDR-017 — Local HTTP API: adapter over the operation table vs schema-first `HttpApi`

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** TDR-016 (engine front-ends; established the adapter pattern); TDR-003 (real-time transport, `proposed` — gates streaming, not this); `openspec/exploration/04-web-ui.md` §3 (client/server contract); invariants I6, I8

## Decision summary
> Serve the operation table over `HttpRouter` as one generic `POST /operations/:name` route plus a self-describing `GET /operations`, on `HttpServer` under Bun, in `packages/agent` beside the MCP and CLI adapters — keeping front-end parity a structural property rather than a test obligation. Schema-first `HttpApi` is layered on later, once the operation set settles or a remote consumer appears.

## Context
- P3's interface half shipped MCP and CLI as logic-free adapters over one operation table (`packages/agent/src/operations.ts`, 13 operations). A browser console cannot speak stdio MCP, so a local HTTP surface is the missing piece — and it is the "local deployable interface" the console will sit on.
- Constraints: Effect 4.0.0-beta.103; decode at every boundary (I6); front-ends hold no behavior and grant no privileged path (I8); the parity property TDR-016 established — every operation reachable identically from every surface — is currently *structural* (one table) and tested by enumeration.
- `effect/unstable/http` (`HttpRouter`, `HttpServer`) and `effect/unstable/httpapi` (`HttpApi`, `HttpApiBuilder`, `HttpApiClient`, `OpenApi`, `HttpApiSwagger`, `HttpApiTest`) are both already in the `effect` dependency. No new package either way.
- Affects `packages/agent` only. Real-time streaming is out of scope and stays gated on TDR-003.

## Options considered

### Option A — Generic adapter: `HttpRouter`, one route over the operation table
- **Description:** `POST /operations/:name` dispatches into the same table MCP and CLI use, plus `GET /operations` publishing each operation's declared arguments (name, kind, optional, description) so a client can discover the surface the same way it discovers the catalog.
- **Pros:** Parity stays structural — a new operation appears on all three surfaces at once, and cannot be forgotten on one. Zero duplication. Smallest change. Matches the shape TDR-016 chose and tested. Self-describing, consistent with the catalog.
- **Cons:** No typed client derived for the console; it decodes responses with shared schemas by hand. No OpenAPI document. One opaque route is a poor *public* API shape — unfriendly to third-party consumers and to HTTP-native tooling (caching, per-route auth, method semantics).

### Option B — Schema-first: declare the surface as an `HttpApi`
- **Description:** Declare each operation as an `HttpApiEndpoint` with request/response schemas; serve with `HttpApiBuilder`; the console consumes `HttpApiClient.make(api)`.
- **Pros:** Delivers exactly what `04-web-ui.md` §3 calls the single most valuable property — one set of Effect Schemas as the contract, with the client decoding via the same schema that produced the response, no hand-written fetch layer. Free OpenAPI/Swagger, `HttpApiTest` for testing, per-route middleware and auth when governance arrives. A durable public API shape.
- **Cons:** The operation table is a runtime list; `HttpApi` wants statically declared endpoints. Declaring all 13 duplicates the table and makes parity a *convention* enforced by a test rather than a structural property — the first thing to rot. Deriving the declaration from the table is possible but surrenders the static types that are the option's whole point.

### Option C — Hybrid: generic route for parity, declared `HttpApi` for the console
- **Description:** Both surfaces over the same table.
- **Pros:** Parity stays structural; the console still gets a typed client.
- **Cons:** Two HTTP surfaces to keep in step, which is the drift risk of B without its simplicity. Twice the surface to secure under P4 governance.

### Option D — Raw `Bun.serve`
- **Description:** Serve directly from Bun, no Effect HTTP layer.
- **Pros:** Fewest moving parts; native to the runtime (TDR-001).
- **Cons:** Drops out of the Effect layer/error model that every other seam uses; error mapping, scoping, and testing all become bespoke. No benefit over Option A, which is equally small.

## Evaluation criteria
1. Preserves the parity property (I8) structurally rather than by convention
2. Quality of the client/server contract for the console (I6, `04-web-ui.md` §3)
3. Consistency with the adapter pattern TDR-016 established
4. Cost to build now, and cost to change later
5. Fitness as a public API when remote access and governance arrive

## Analysis
- **Criterion 1 splits A/C from B.** Parity is currently a property of the architecture: there is one table, so a surface cannot lag. B converts it into a test obligation. Tests do catch this, but the thing that made the MCP/CLI parity credible was that it was hard to break, not that it was asserted.
- **Criterion 2 favors B decisively, and its advantage is real but narrower than it looks.** I6 is satisfied either way — the console imports `@viokit/schema` and decodes with it regardless. What B adds is *derived* client types and OpenAPI, i.e. convenience and documentation, not invariant compliance.
- **Criterion 4 is where the argument settles.** The operation set is 13 items old and still moving: `ingest` was added days after the table existed, and a browser transport, credentials, and streaming will each move it again. Declaring a static API over a moving set pays the duplication cost every time. Once the set stabilizes, B becomes cheap — and Option A does not foreclose it, because the table remains the single source either way.
- **Criterion 5 favors B**, but the surface being decided here is a *local* one. Remote access is TDR-003 and P4 governance territory, and a public API shaped for third parties should be designed then, against a settled operation set, rather than guessed at now.
- Option D loses to A on every criterion except novelty. Option C's cost is ongoing; its benefit is available later by adding B on top of A.

## Recommendation
- **Option A**, with the self-describing `GET /operations` endpoint: one generic dispatch route over the existing table, served on Bun, in one process that will also serve the console's static assets.
- **Amended during implementation:** the two routes are matched directly against the `Request` rather than through `HttpRouter`. `HttpRouter.toHttpEffect` returns a scope-carrying effect that does not fit `HttpEffect.toWebHandlerLayerWith`'s handler type in this beta, and for a two-route surface the router was buying plumbing rather than structure. Effect still owns everything behind the operation table — layers, error channel, the boundary decode — so the decision itself is unaffected; only the routing mechanism is simpler than first written. Revisit if the surface grows enough routes that hand-matching becomes the liability.
- Parity remains structural: the same enumeration test extends to cover the HTTP surface, so all three front-ends stay in step by construction.
- **What would change this decision:** the operation set settling; a remote or third-party consumer appearing (at which point the OpenAPI document and per-route middleware stop being conveniences); or governance needing per-route authorization, which `HttpApi` middleware models better than a single dispatch route.

## Open questions
- Whether the console's static assets are served by this process or by Vite in development. Not blocking — it changes no operation and no contract.

## References
- TDR-016 (front-end adapter pattern, parity as a tested property); TDR-003 (streaming, `proposed`)
- `openspec/exploration/04-web-ui.md` §3 (shared-schema client/server contract)
- `packages/agent/src/operations.ts` (the table all three surfaces share)
