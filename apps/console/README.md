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

## What it deliberately does not do

- **Persist view state.** A reload starts over. I12 requires view state to be schema-encoded,
  versioned, per (user, investigation), and server-backed; a `localStorage` shortcut would satisfy
  the need and violate the invariant. See TDR-012.
- **Visualise the graph.** Results are tables. The 4D canvas is its own design problem.
- **Reach the engine any other way.** Everything goes through operations the MCP and CLI surfaces
  also expose (I8), and every response is decoded with `@viokit/schema` (I6).
