# @viokit/console

The browser client. Four views over the local HTTP surface (TDR-017), built entirely from what the
deployment reports about itself — registering a pack changes what the console offers with no console
change.

```sh
bun --bun packages/agent/src/http.ts     # the engine, on :4000
bun run --filter @viokit/console dev     # the console, on :5173
```

Point the console elsewhere with `VITE_VIOKIT_API` (default `http://127.0.0.1:4000`).

| View | What it does |
|---|---|
| Catalog | registered sources, transforms, and types; which sources this deployment can acquire, and why not for the rest |
| Transform | a form generated from the transform's published contract; runs by catalog id, **stages** steps, commits on a separate action |
| Evidence | submit an artifact you retrieved by hand for a source the engine cannot fetch |
| Graph | entity lookup and the four query surfaces, as tables |
| Canvas | the replayed graph drawn as nodes and edges, with a time filter; selecting a node shows the steps that produced it and the evidence behind them, down to the artifact |

View state — current view, selected transform, catalog filter — is persisted **server-side**,
schema-encoded and versioned (TDR-012, I12), never in the browser. Set `VIOKIT_VIEW_STATE_DIR` to
choose where it lives (default `./.viokit/view-state`).

## What it deliberately does not do

- **Show the whole graph regardless of size.** The canvas renders up to a bound and *says* when it
  has truncated, because a subset presented as the whole graph is the worst failure available to an
  investigation tool. Map and timeline panes, and live updates, are still to come.
- **Reach the engine any other way.** Everything goes through operations the MCP and CLI surfaces
  also expose (I8), and every response is decoded with `@viokit/schema` (I6).
