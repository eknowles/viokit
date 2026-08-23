# TDR-025 — Investigations and branches over an append-only step log

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** TDR-005 (DuckDB graph store — this partitions what that decided), TDR-010/TDR-021 (evidentiary export, which currently has no case to scope to), TDR-012 (view state, whose `investigation` key is a placeholder waiting on this), TDR-023 (identity — authorization needs something to scope to); invariants I3 (append-only, replay reproduces state), I2 (provenance closure), I11 (offline determinism); `CONTRACT.md` capability `investigations`; `exploration/01` §capability map

## Decision summary
> **Recommended:** an investigation and branch scope on the step log, with branches as a parent pointer plus fork sequence (**Option A**). Scope is enforced at the one place that reads the log — `replay` — because every query already reads the *projection* that replay rebuilds, not the log. Cross-investigation questions stay answerable through an explicitly-named operation.

## Context

There is no such thing as an investigation. `Step` carries `evidenceIds`, `operation`, and source
attribution, and nothing else; the DuckDB step log is `(seq, data)` with no partition; `replay` folds
the whole table; `exportBundle(path)` writes every artifact on the machine. `localUser` and
`defaultInvestigation` are two string constants in `view-state.ts` under a comment that calls them
placeholders.

The architecture has assumed this capability throughout. `CONTRACT.md` lists `investigations` —
"cases, branching, export/report" — as an owned capability whose obligation is that the evidentiary
trail is complete on export. `exploration/03` says "an investigation is a serializable step log +
evidence refs ⇒ portable". `exploration/04` builds the console around a *current investigation*.
Nothing was ever built.

What that costs today:
- Two pieces of work cannot be done without contaminating each other — every step lands in one graph.
- The evidentiary export, the feature this project treats as its proof of seriousness, exports the
  machine rather than the case.
- View state cannot key itself honestly.
- Authorization has nothing to scope to; TDR-023 would otherwise have to authorize "the graph".

Constraints this decision must satisfy:
- **I3**: the log stays append-only and replay reproduces state deterministically. Whatever a branch
  is, it must not be a mutation of history.
- **I2**: every vertex still arrives with a step citing evidence; scoping must not become a way to
  lose attribution.
- **I11**: offline determinism — same cache, same inputs, same graph — must hold per investigation.
- Evidence is content-addressed and shared: two investigations that acquire the same bytes must not
  duplicate them, and must not be able to hide that they overlap.
- TDR-005 chose DuckDB with the graph as a replay projection over the log. This decision partitions
  that; it should not overturn it.

Affects `packages/schema` (`Step`, the graph seam), `packages/engine` (store, replay, export,
view-state keys), `packages/agent` (the operation table), and `apps/console` (a current case).

## Options considered

### Option A — A column on the log; branches are a parent pointer
- **Description:** `Step` gains `investigationId` and `branchId`. Each branch row records its parent
  branch and the `seq` it forked at. Replay for a branch folds its ancestor chain up to each fork
  point, then its own steps.
- **Pros:** One database, one log, one projection pipeline. Forking is O(1) — a row, not a copy. Cross-
  investigation questions ("who else has seen this evidence?") stay answerable in SQL, which is a real
  investigative question and one an OSINT tool should be able to ask. Export scopes by filtering the
  same log it already reads.
- **Cons:** A single file holds every case, so "give me this case" is an export rather than a file
  copy, and the projection can only hold one investigation at a time.
  *Two cons originally listed here were disproved by the spike and are struck rather than deleted, so
  the reasoning stays legible:* ~~every query grows a scope predicate, and forgetting one leaks
  silently~~ — queries read the projection, not the log, so only `replay` needs the scope;
  ~~replay for a deep branch chain is a fold over several ranges rather than one~~ — measured cheaper
  than today's flat fold at every depth tested.

### Option B — A database file per investigation
- **Description:** Each investigation is its own DuckDB file with its own log and projection. Branches
  are files too, seeded by copying the parent's log at the fork point.
- **Pros:** Isolation is physical, so leakage is not a class of bug that exists. Matches
  `exploration/03` literally — a case is a portable artifact you can hand over or archive. Replay is
  unchanged: fold the whole table, exactly as today.
- **Cons:** Cross-case questions become impossible without opening every file, and the one about
  shared evidence is the one worth asking. Forking copies the log, so a branch costs proportional to
  its parent's history. Many open cases means many open database handles, and the evidence store is
  still shared, so "portable file" is only half true — the artifacts live elsewhere.

### Option C — Copy-on-write branches within one log
- **Description:** As A for investigations, but a fork copies the parent's steps into the branch with
  new ids, so a branch is self-contained.
- **Pros:** Replay for a branch is a single fold with no chain to walk; a branch can be discarded by
  deleting its rows.
- **Cons:** Copying steps means two step ids for the same act, which weakens the trail: a claim now
  has two provenance paths that are not the same and not distinguishable. Storage grows with every
  fork. Rejected in spirit already — TDR-015 rejected a store-rewrite for the same reason (I3/I11).

### Option D — Branches as named pointers over a step DAG (git-shaped)
- **Description:** Steps carry a parent step id, forming a DAG; a branch is a named pointer at a step.
  Replay walks from a pointer back to the root. Merging is a step with two parents.
- **Pros:** The most expressive: real merges, shared history without copying, and a model investigators
  and engineers both already understand.
- **Cons:** Substantially more machinery — merge-base computation, conflict semantics for a graph
  projection, and a replay that is a DAG walk rather than a fold. Nothing has asked for merge yet, and
  a model that supports it costs whether or not it is used.

## Evaluation criteria
1. Does replay stay deterministic and the log append-only (I3)? — non-negotiable
2. Can a case be exported and reopened as a self-contained thing?
3. Can the tool still answer "does this evidence appear in another case?"
4. Cost of a fork, in time and storage
5. How the failure mode behaves when it is wrong — silent leak, or loud error
6. Machinery added relative to what is actually needed now

## Spike evidence

Run 2026-08-23 against DuckDB 1.5.5-r.4 at the scale TDR-005 established (1.2M steps), with the log
partitioned by `(investigation_id, branch_id, seq)` and 20 investigations sharing one table.

| Measurement | Result |
|---|---|
| Flat read of the whole log — what replay does today | **1013 ms** |
| Read scoped to one investigation (60k steps) | **38 ms** |
| Read of a 3-level branch ancestry chain | **34 ms** |
| Same, with an index on `(investigation_id, branch_id, seq)` | **34 ms** — no material gain; DuckDB is columnar and the scan is already cheap |
| Read of a **10-level** ancestry chain, selecting nearly the whole log | **532 ms** |
| Decode + fold of 60k steps, using the production `Step` schema and date reviver | **422 ms** |

**Two findings, and the first inverts the concern this TDR was worried about.**

1. **Scoping does not cost, it saves.** Replay's dominant term is not the SQL but the JS decode-and-
   fold, at roughly 7 ms per 1000 steps — so folding 1.2M steps costs about **8.4 seconds**, and a
   scoped 60k-step case costs about **0.5 s** end to end. Today's unscoped replay is O(every step on
   the machine), so it degrades as *unrelated* work accumulates. Investigations fix a scaling problem,
   not merely an organisational one. A branch's ancestry chain is not a risk at any depth tested: 10
   levels selecting nearly the whole log still beat the flat read of the same rows.

2. **The missing-predicate failure mode is far smaller than assumed, because of how the store is
   already built.** The log is read in exactly two places — `replay`'s single `SELECT data FROM
   step_log ORDER BY seq`, and the `MAX(seq)`/`INSERT` used to append. *Every* query (paths,
   relatedness, timeline, spatial, queryEntity) reads the **projection** tables, which `replay`
   rebuilds after clearing them. So if replay is scoped, the projection *is* one investigation and no
   query needs a scope predicate at all. The risk collapses from "every query, forever" to **one
   SELECT and one INSERT**, reviewable in a single sitting.

   The cost of that is real and worth naming: the projection holds one investigation at a time, so
   switching cases means re-projecting — measured at ~0.5 s for a 60k-step case. Querying two cases
   at once needs two connections, which is what a file-per-case would have needed anyway.

## Analysis

The shape of it:

- **Criterion 1 eliminates C** on the same grounds TDR-015 rejected a store rewrite: duplicating steps
  gives one act two provenance paths, and the trail is the product.
- **Criteria 3 and 5 looked like the real tension, and the spike resolved it.** B makes leakage
  impossible and cross-case questions impossible with it. A keeps both possible. An OSINT tool whose
  whole claim is provenance should be able to say "you have seen this artifact before, in another
  case" — that is not a nice-to-have, it is the kind of connection the tool exists to surface. The
  objection to A was that its failure mode is a silent missing predicate, and this codebase has
  produced three silent-wrong-answer bugs in a row (proxy route reuse, placeholder content types, a
  capability claimed but not wired). Finding 2 shows that objection does not apply here: queries read
  a projection, not the log, so scope is enforced in one place rather than sprayed across every query.
  That is a smaller surface than a reviewer could hold in their head, and much smaller than B's cost.
- **The structural-scoping idea turns out to be the wrong lever.** A store handle bound to an
  investigation would stop a *caller* omitting a scope — but a required parameter already does that at
  compile time, and callers were never where the risk lived. The risk is the store's own SQL
  forgetting the predicate, which no seam shape prevents. What actually addresses it is the
  architecture already in place: one scoped read, feeding a projection everything else queries.
- **D is the destination if merge is ever wanted**, and A is a subset of it: a parent pointer per
  branch is a degenerate DAG. Choosing A does not foreclose D.
- **Criterion 4 favours A and D decisively.** A hypothesis you hesitate to fork is a hypothesis you do
  not test, so a fork must be cheap enough to be casual. Under A a fork is a row; under B it is a copy
  of the parent's history, which at 1.2M steps is exactly the hesitation to avoid.
- **Criterion 2 is B's remaining advantage, and it is weaker than it looks.** A case as a file sounds
  portable, but the evidence lives in a separate content-addressed store either way, so the file was
  never the whole case. The portable artifact is the export bundle, which TDR-010 already defines and
  which A scopes by filtering the same log it reads.

## Decision

- **Option A**, with two refinements settled while implementing and recorded here rather than
  discovered later:

  1. **The scope lives on the log, not on `Step`.** The option text said `Step` gains
     `investigationId` and `branchId`. It should not: `Step` is the evidentiary record, and a case id
     repeated on every step would travel in every bundle to say once what the manifest already says.
     The log table carries `investigation_id`; the store is what knows about partitioning, which is
     where partitioning belongs. Nothing in the trail is weakened — a step still belongs to exactly
     one investigation, and the log says which.

  2. **A branch *is* an investigation, one with a parent.** Two types would have been two lifecycles,
     two lists, and two sets of operations to keep in step, for a distinction that is one nullable
     field: an investigation with a `parent` and a `forkedAt` sequence is a branch, and one without is
     a root. Fork, discard, open, list, and export then work on both without special cases.

- `investigation_id` on the step log; an investigation row recording its parent and the sequence it
  forked at; replay folds the ancestor chain to each fork, then the investigation's own steps.
- **Scope is enforced at `replay`, and nowhere else needs it.** Queries read the projection replay
  rebuilds, so they inherit the scope by construction. The two places that touch the log directly —
  the replay read and the append — are the whole reviewable surface.
- **The projection holds one investigation at a time.** Switching re-projects, at roughly half a
  second for a 60k-step case. Two cases at once means two connections.
- **Cross-investigation questions are a separately-named operation**, never a parameter on an ordinary
  query, so reaching across cases cannot be done by accident.
- Both things this decision said needed establishing were measured, and both came back in A's favour:
  branch-chain replay is cheaper than today's flat fold at every depth tested, and the missing-
  predicate risk lives in one function rather than in every query.

- **What would change this decision:** a requirement to query two investigations *simultaneously* as a
  routine act rather than an occasional one, which would make the single-projection constraint bite
  and reopen B; or a real need to merge branches, which is D.

## Open questions
- **Does an investigation own its view state, or does view state reference it?** TDR-012 keys by
  (user, investigation, surface) already, so this mostly resolves itself — but deleting a case should
  probably take its view state with it, and view state must not travel in an evidentiary bundle.
- **What does discarding a branch mean** when the log is append-only? Probably a status on the branch
  rather than deletion of steps — but then export must decide whether a discarded branch travels with
  the case. An investigator's rejected hypotheses may be exactly what a reviewer needs to see.
- **Does evidence get scoped at all, or only steps?** The store is content-addressed, so the same bytes
  are one artifact regardless of who acquired them. That is correct for integrity and awkward for
  retention: deleting a case cannot delete evidence another case cites.
- **What is an investigation's identity?** A generated id with a mutable name, presumably — but if a
  case is portable, two machines can produce the same name and must not collide.
- Whether "current investigation" belongs in view state (configuration) or is a property of the
  session/request. It reads like configuration and behaves like scope.

## References
- `CONTRACT.md` — capability `investigations`; invariants I2, I3, I11
- `exploration/01` §capability map; `exploration/03` §"an investigation is a serializable step log";
  `exploration/04` §client state
- TDR-005 (graph store), TDR-010/021 (export), TDR-012 (view state), TDR-015 (why a store rewrite was
  rejected), TDR-023 (identity, which needs a scope)
