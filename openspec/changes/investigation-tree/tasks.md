## 1. Spike and schema

- [x] 1.1 Run the spike: commit two runs that add the same entity and check `replay` leaves one; read per-transform runnability from the catalog; submit a seed as evidence; record the results under `## Spike` in this design before continuing; verify the section exists and each claim names what was run
- [x] 1.2 Add the optional `accepts` to `TransformSpec` and the `RunRecord` schema; verify decode tests accept a valid record and reject one without an outcome

## 2. Packs declare what they accept

- [x] 2.1 Declare `accepts` on `dig-resolve`, `whois-registration` (domain, `domain`), `nmap-open-ports` (ip-address, `ip`) and the crt.sh transform (domain, `domain`); verify a catalog test lists each with its accepted kind and that undeclared transforms list none

## 3. Run log

- [x] 3.1 Add a run-log seam with an in-memory and a filesystem JSON-lines backend, scoped per investigation; verify append and read-back, ordering, and that two investigations do not see each other's records

## 4. The expander

- [x] 4.1 Implement seeding through the evidence path; verify the seed entity exists with its evidence and that no entity is present without it
- [x] 4.2 Implement the breadth-first loop with once-per-pair dedup and depth counting, using stub transports; verify a discovered entity is expanded, a pair is never repeated, and a doubly-reached entity keeps the shorter depth
- [x] 4.3 Implement the four caps and the stop reason; verify each cap stops the expansion with its own reason, and that exhaustion is reported
- [x] 4.4 Skip unrunnable sources once with the reason, record failures and continue, and apply the kinds policy; verify an unrunnable transform is skipped once not per entity, a failing run does not stop the others, and passive-only skips an active transform
- [x] 4.5 Write a run record per run, including failures; verify the record names the transform, input entity, duration, outcome and additions

## 5. Reading the tree and the operations

- [x] 5.1 Implement reading the tree from the records, nested by the entity that caused each run; verify an entity traces to its run and the nesting matches the expansion
- [ ] 5.2 Add `tree_expand` and `tree_show` to the shared operation table; verify the CLI, MCP and HTTP listings all include them and a call returns the same result on each (I8)

## 6. Acceptance

- [ ] 6.1 Write the deterministic acceptance test: a stub transport returning canned output, one seed, at least 5 transforms across at least 3 entity kinds, at least 50 entities, each tracing to a run; verify it passes and that removing a transform's `accepts` makes it fail
- [ ] 6.2 Run one real unattended expansion against the sidecar for a seed domain with the default caps, and record the real numbers (runs, entities, kinds, stop reason, wall time) in the design; verify the figures are the observed ones, and say plainly if they fall short of the stub test's
- [ ] 6.3 Run `bun run check` and the package and script tests; verify they are green apart from the known pre-existing `dispatch.test.ts` failure, and that no existing test was edited
