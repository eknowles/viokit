# Browser Smoke Findings

## Why

The console had never been run in a browser. Once CORS was fixed and it could load, driving it through a real headless browser found two defects that no amount of unit testing or server-side verification would have surfaced — and one of them is an engine correctness bug, not a UI blemish.

**`replay` is not safe under concurrency.** It clears the materialized projection and rebuilds it, so two concurrent calls both clear, then both insert, and each returns a doubled graph — four entities where the log folds to two. React's StrictMode double-invokes effects in development, which fires exactly that pattern. A replay whose answer depends on who else is reading violates I3, and it would corrupt any two simultaneous readers: an agent and a console, or two agents.

**The graph's selected class never applied.** The class was built as a template literal in the JSX attribute, and the formatter normalises class strings there — it was silently eating the separator and producing `node entityselected`, so `.node.selected` matched nothing. Selection worked; it just never looked like it did.

## What Changes

- **`replay` is serialized** behind a single permit, so the projection has one writer at a time and concurrent readers get the same graph a sequential reader would.
- **Node classes are computed outside the JSX attribute**, where the formatter cannot rewrite them.
- **A concurrency regression test** on the graph store, and the browser-driven check kept as a documented procedure rather than a one-off script.

## Capabilities

### Modified Capabilities

- `graph-query`: replay returns the same graph regardless of concurrent readers.

## Impact

- `packages/engine`: a semaphore around the projection rebuild in the DuckDB store.
- `apps/console`: the node class is assembled before it reaches JSX.
- Tests: concurrent replays agree with a sequential one, and repeated concurrent replays do not accumulate.
- The wider lesson is already in `CONTRIBUTING.md` from the CORS fix: browser-facing changes get checked from a browser. This change is what that check found the first time it ran.
