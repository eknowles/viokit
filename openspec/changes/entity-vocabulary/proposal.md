## Why

Entity kinds and relation types are free-form strings in each pack's projections. That was fine with one pack. The goal is many agents wrapping many tools in parallel, and without a shared list each will invent its own names for the same thing (`domain`, `hostname`, `fqdn`), so the investigation tree fills with duplicates that never connect. The project decision is one vocabulary, edited by one lane, that tool wrappers must use.

## What Changes

- Add a `@viokit/vocabulary` package holding the entity kinds and relation types, each with a description. The seed is the ten kinds and thirteen relations the first tools produce, with names informed by SpiderFoot's event types (MIT licensed, attributed in the file). It is not a copy: SpiderFoot's 172 types are trimmed to what Viokit uses and renamed to the repository's existing hyphenated style.
- Add a conformance check, held out like the I4/I10 check, that fails when any other pack uses an entity kind or relation type that is not in the vocabulary. A violating fixture proves it can fail.
- Protect the vocabulary in the held-out guard: a change that edits it fails unless the guard is run with an explicit steward flag, which the orchestrator passes only for changes named as vocabulary changes.
- Existing packs already conform (they use `domain`, `ip-address`, and four relations), so no runtime behaviour changes.

Out of scope: schema-level enforcement in the engine (core must not hold domain types, so enforcement stays a check), per-kind attribute schemas, entity resolution rules, and the tree itself.

## Capabilities

### New Capabilities
- `entity-vocabulary`: the shared list of entity kinds and relation types, and the check that keeps every pack inside it.

### Modified Capabilities

## Impact

- `packages/vocabulary/`: new. `conformance/`: a vocabulary check and fixture. `conformance/guard.ts`: protects the vocabulary, with a steward flag. `scripts/deliver/`: passes the flag for vocabulary changes.
- `package.json`: the conformance script also runs the vocabulary check.
- No new dependency and no runtime change.
