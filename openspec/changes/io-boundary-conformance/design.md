## Context

`CONTRACT.md` states I4 and I10 as prose. The merge gate in `docs/PROJECT_PICTURE.md` (decisions 9 and 10) needs them executable and out of an author agent's reach. The repo already runs Biome through `ultracite check`, and the pre-commit hook and the pipeline both call it. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- A check that fails on direct I/O outside the runtime, using tooling already installed.
- A way to prove the check still works.
- A guard that stops an author agent weakening any of it.

**Non-Goals:**
- Hiding the checks from the author (see Decision 4).
- Data-flow analysis. The check is syntactic.
- The other invariants.

## Spike

Run 2026-11-13 against Biome 2.5.6 and TypeScript 7.0.2.

| Question | Result |
|---|---|
| Can the TypeScript compiler API be used, as first planned? | **No.** The installed `typescript` 7.0.2 is the native port: `createSourceFile` and `forEachChild` are undefined. The plan needed a different tool. |
| Can a Biome GritQL plugin flag the violations? | **Yes.** A rule for `fetch(...)`, `Bun.spawn(...)`, `Bun.serve(...)`, `new WebView(...)`, and an import-source rule for `node:child_process`, `node:http(s)`, `net`, `tls`, `dgram` flagged all three lines of a planted file and nothing in a clean file. |
| Does it avoid false positives on `transport.fetch(...)`? | **Yes.** `browser.fetch(...)` and `http.fetch(...)` in `packages/sources/src/dispatch.ts` were not flagged. |
| Does the check pass the current tree? | **Not entirely.** Scanning `packages` and `apps`, three plugin errors: `packages/sources/src/browser-pool.ts:1` and `browser.ts:97` (the transports, expected and allowed by path) and `packages/agent/src/http.ts:236`, a `Bun.serve` call. |
| What is `http.ts:236`? | An inbound listener for the local API, not acquisition. It is not an I4 violation, so `Bun.serve` is dropped from the rules rather than allowlisted. |
| Does a planted violation under `packages/engine/src` get caught in the real tree? | **Yes.** Three more errors, one per line, at the planted file. |
| Do path exclusions work? | **Not in the spike.** The spike config sat outside the repo, so its `files.includes` patterns resolved against the wrong root and the transports were not excluded. The real config lives at the repo root; task 1.2 re-runs this to confirm. |

Existing violations outside the allowed paths: none.

What the rules do not catch: an alias (`const f = fetch; f(url)`), `globalThis.fetch(...)`, a dynamic `import("node:child_process")`, a shell template (`Bun.$`), and I/O reached through a third-party library. They are listed so no one reads "check passes" as "no I/O exists".

## Decisions

### 1. Biome GritQL plugins, not a script and not the compiler API
The compiler API is unavailable (spike). A hand-written scanner is a new tool to maintain. Plugin rules run in the lint pass that already runs, report with file and line, and need no dependency.

### 2. Allowed paths are an explicit list
The transports (`packages/sources/src`) and `SourceRuntime` and egress in `packages/engine/src` are the only places allowed. The list lives in `biome.jsonc`, so adding a path is a reviewed change to a protected file.

### 3. Inbound listening is out of scope
I4 is about acquisition. A server that accepts connections for the local API is an interface (I8), so `Bun.serve` is not in the rules.

### 4. Held-out means immutable here, not invisible
An author agent can read the rules, so it could write code that avoids the exact patterns. Immutability stops it weakening them, which the research identified as the observed failure. Invisibility would need the checks kept outside the author's checkout, which the orchestrator can add later by running a private copy. This change does not claim it.

### 5. The guard protects the conformance set, not every test
The research suggested failing any change that touches tests. A delivered tool brings its own fixture test, so adding must be allowed. The guard fails on modification or deletion of files that existed on the base, which is the weakening case, and on any change to the protected set.

### 6. The guard runs from the base
The orchestrator runs the guard from the base branch (`git show <base>:conformance/guard.sh`), so an author who edits the guard still faces the old one.

## Risks / Trade-offs

- **Syntactic rules are evaded by aliasing or dynamic import** → listed in the spike; a later change can add a type-aware check when a usable compiler API exists.
- **A genuine need for I/O outside the runtime has no path** → add it to the allowed list through a protected-file change, which is deliberate friction.
- **An author who can read the rules can route around them** → accepted for now (Decision 4).
- **Biome's plugin support is young** → the control test fails loudly if the plugin stops loading.
