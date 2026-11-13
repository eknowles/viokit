# Conformance checks

Executable checks that hold the invariants against code written with no human review. Everything in
this directory is **protected**: a change that modifies it fails the guard (see below).

## I4 / I10: outbound I/O belongs to the runtime

`bun run conformance` runs two things:

1. **Plugin rules** (`rules/*.grit`, configured by `biome-conformance.json`). They fail on `fetch(...)`,
   `Bun.spawn(...)`, `new WebView(...)` and imports of `node:child_process`, `node:http(s)`, `node:net`,
   `node:tls`, `node:dgram`, anywhere except the transports (`packages/sources/src`) and the source
   runtime and egress (`packages/engine/src/source-runtime.ts`, `egress.ts`). Tests are not scanned.
   Inbound listeners (`Bun.serve`) are not acquisition and are not flagged.
2. **A suppression scan.** A `biome-ignore` comment naming `lint/plugin` would switch a rule off for
   the code beneath it, so any such comment fails the check.

`control.test.ts` is the positive control: it fails if the rules stop flagging
`fixtures/violation.ts`, and if the suppression scan stops flagging a planted comment.

### What it does not catch

The rules are syntactic. They miss an alias (`const f = fetch; f(url)`), `globalThis.fetch(...)`, a
dynamic `import("node:child_process")`, a shell template (`Bun.$`), and I/O reached through a
third-party library. A pass means "no direct I/O in these forms", not "no I/O".

## The held-out guard

`guard.ts <base-ref>` fails a change whose diff against the base:

- touches anything under `conformance/` or `openspec/specs/`, or `biome.jsonc` or `lefthook.yml`;
- modifies or deletes a test file that existed on the base (adding a new test file is allowed);
- changes the `conformance` script in `package.json`.

The orchestrator MUST run the **base branch's copy**, so a change cannot weaken the guard that judges
it:

```sh
git show <base>:conformance/guard.ts > "$TMPDIR/guard.ts"
bun "$TMPDIR/guard.ts" <base>
```

Held-out here means **immutable**, not invisible: an author can read these files. Immutability stops
the check being weakened, which is the failure the research found. Keeping the rules out of the
author's checkout needs the orchestrator to run a private copy, which is not done yet.
