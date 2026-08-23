# Identity and Authorization

## Why

Nothing in this system could say who is acting. The HTTP surface documented itself as
"unauthenticated by design at this stage: it binds to loopback and must not be exposed beyond the
local machine until governance lands", and view state keyed itself by `localUser`, a string constant.

**That guard was a comment, not a mechanism.** `serve()` read
`process.env.VIOKIT_HTTP_HOST ?? "127.0.0.1"`, so one environment variable published an
unauthenticated engine that anyone reaching the port could drive — acquiring from the network,
reading every artifact, exporting any case. Nothing refused. Same class as a transport capability
claimed but never wired, and this is the fourth of those.

TDR-025 made this worth doing properly. Before investigations, authorization would have been about
"the graph", which is not a useful permission — either you can drive the engine or you cannot. With
cases there is something worth granting: this investigation, to these people, and not the one beside
it. The roadmap's exit criterion for this track says exactly that.

## What Changes

- **A `Principal` — a person or an agent** — resolved from a bearer credential through a
  `PrincipalStore` seam, environment backend first. The shape TDR-018 already chose for secrets, so
  there is one seam pattern here rather than two.
- **No principals configured means local single-user**, exactly as before. A tool that demands a
  token to look at your own machine gets worked around.
- **The server refuses to bind beyond loopback unless the deployment authenticates.** The comment
  becomes a mechanism, and it is a pure function so it is testable without starting a server.
- **Every operation runs as a principal**, on all three front-ends identically (I8). The local ones
  take a credential from the environment: if a deployment authenticates, the CLI presents one like
  anyone else, because acting as an implicit local operator would be a hole exactly where the
  machine's owner would look for one.
- **Authorization is membership of an investigation.** Creating one makes you owner and sole member;
  only the owner admits others or discards. A case you are not party to cannot be opened or branched,
  and **is not listed** — naming cases somebody is not party to is itself disclosure.
- **Reaching a case you may not is a refusal, not an empty result.** "You may not see this" and "this
  is empty" are different facts.
- **View state keys by the resolved principal**, retiring TDR-012's placeholder.
- **`whoami`**, because a deployment that can answer "who" should be willing to say so.

Not in this change: an interface for administering membership beyond the operation table, credential
expiry or revocation (the environment backend cannot express either), an audit log, and bundle
signing — which this unblocks by giving it an identity to sign as.

## Impact

- `packages/schema`: `Principal`, `PrincipalStore`, `CurrentPrincipal`, `Unauthorized`;
  `Investigation` gains `owner` and `members`; the graph seam takes a principal.
- `packages/engine`: membership checks in both stores; the environment-backed principal store.
- `packages/agent`: per-request resolution from `Authorization: Bearer`, the local credential for CLI
  and MCP, the bind guard, and `add_member` / `whoami`.
- Tests: 19 new — the separation between two principals on both stores, credential resolution, and
  the bind guard.
- TDR-023 is `decided`.

## Found by using it

- **`members` came back undefined from a reopened database**, and the type checker did not catch it
  because the row was built with an `as Investigation` cast. The suite missed it because tests run
  in-memory, so the load path had only ever run against an empty table. Constructed rather than cast
  now, and pinned by a test that reopens a persisted store — the first test here that does.
