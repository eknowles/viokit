## Why

Delivery is moving to parallel agents merging into an `integration` branch with no human reading each change. The gate that replaces review has to be something the author agent cannot weaken. Invariants I4 and I10 (only the source runtime and its transports perform network or process I/O, and choose cache and egress) are the ones agent-written tools are most likely to break, and today nothing checks them: they are prose in `CONTRACT.md`.

## What Changes

- Add a conformance check for I4 and I10 as Biome GritQL plugin rules, run by the existing lint pipeline. It fails on outbound network calls (`fetch`), process starts (`Bun.spawn`, `child_process`), browser launches (`WebView`), and imports of the network and process modules, anywhere outside the runtime's transports and `SourceRuntime`.
- Add a positive control: a deliberately violating fixture that the check must flag, and a test that fails if it does not, so the check cannot silently stop working.
- Add a held-out guard: a script run by the orchestrator, from the base branch's copy, that fails a change whose diff modifies or deletes the conformance rules, their configuration, the guard itself, an existing test file, or a main spec under `openspec/specs`. Adding new test files stays allowed, because a delivered tool brings its own fixture test.
- Wire both into the existing check pipeline without changing runtime behaviour.
- Record the spike result in `design.md`, including the finding that the TypeScript compiler API is not available in this repo's TypeScript 7.

Out of scope: the other invariants (I2, I6, I1, I5, I8 follow as separate changes), the orchestrator that runs the guard, and `exec-transport`. Making the tests invisible to the author is not done here; this change makes them immutable, and the design says what that does and does not give.

## Capabilities

### New Capabilities
- `conformance-checks`: executable checks that hold the invariants against agent-written code, with a positive control and a guard that keeps them out of an author's reach.

### Modified Capabilities

## Impact

- `biome.jsonc`: registers the plugin rules and the allowed paths.
- `conformance/`: the GritQL rules, the violating fixture, and the guard script. New directory.
- `package.json` and `lefthook.yml`: a check script and its wiring.
- `.agents/skills/viokit-build/references/CONTRACT.md`: names the checks as the enforcement of I4 and I10.
- No new dependencies and no runtime change.
