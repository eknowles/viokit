# Investigations

> **Gated on TDR-025** (investigation and branch model), now `in-review` with its spike run and a
> recommendation made: a scope on the step log, branches as a parent pointer, and scope enforced at
> `replay` alone. This proposal states what the capability is for and what it must do; the TDR must be
> `decided` before any of it is built.

## Why

There is no such thing as an investigation.

`Step` carries evidence ids, an operation, and source attribution, and nothing else. The step log is
`(seq, data)` with no partition. `replay` folds the whole table. `exportBundle(path)` writes every
artifact on the machine. `localUser` and `defaultInvestigation` are two string constants sitting under
a comment that calls them placeholders.

The architecture has assumed this capability since the first exploration document. `CONTRACT.md`
lists `investigations` — cases, branching, export/report — as an owned capability whose obligation is
that the evidentiary trail is complete on export. `exploration/03` states that "an investigation is a
serializable step log + evidence refs ⇒ portable". The console was designed around a *current
investigation*. None of it exists.

Three consequences, in order of how much they cost:

- **Two pieces of work cannot be kept apart.** Every acquisition, every derived entity, every
  correlation lands in one graph. An investigator cannot look into two things, and cannot put one
  down and come back to it. This is the unit of work the whole tool is organised around, and it is
  missing.
- **The evidentiary export exports the wrong thing.** A bundle is supposed to be a case, handed to
  someone who can verify it. Today it is everything the machine has ever acquired — which is both
  useless to the recipient and a disclosure problem, since it necessarily includes material from
  work they have nothing to do with.
- **Everything downstream is waiting on it.** View state cannot key itself honestly. Retention and
  redaction have no unit to apply to. Authorization has nothing to scope to — TDR-023 would otherwise
  be reduced to authorizing "the graph", which is not a product.

## What Changes

- **An investigation is a first-class thing**: created, named, listed, opened, closed. It owns a step
  log; every step belongs to exactly one.
- **The graph is scoped to it.** Replay, queries (paths, timeline, spatial, relatedness), and the log
  answer for one investigation. Reaching across cases is possible but never accidental — it is a
  differently-named act, not a forgotten argument.
- **Branches.** Fork a hypothesis from a case, work it, then keep it or discard it. Cheap enough to be
  casual, because a hypothesis you hesitate to fork is one you do not test. Discarding does not
  rewrite history (I3); what a discarded branch *means* on export is an open question in the TDR, and
  a reviewer may well need to see rejected hypotheses.
- **Export becomes a case.** A bundle is one investigation's claims, steps, evidence, and raw bytes —
  which is what the format was always for.
- **View state keys itself for real**, replacing the placeholders TDR-012 shipped with.
- **Evidence stays shared and content-addressed.** The same bytes acquired in two cases are one
  artifact. That is right for integrity and awkward for retention, and the awkwardness is stated
  rather than designed around.
- **"Which evidence appears in more than one case" becomes answerable** — an explicit, separately
  named query. For a tool whose whole claim is provenance, noticing that two cases touch the same
  artifact is not an incidental capability; it is the sort of connection the tool exists to surface.

Not in this change: identity and authorization (TDR-023 — this gives it the scope it needs, and does
not pretend to be it), retention and redaction (TDR-024), merging branches, and cross-case
*graph* queries beyond the shared-evidence question.

## Capabilities

### New Capabilities

- `investigations`: cases and branches as the unit of work; the step log belongs to one; export is
  scoped to one.

### Modified Capabilities

- `graph-query`: every query answers for an investigation rather than for the machine.
- `graph-persistence`: the step log is partitioned; replay is scoped.
- `evidentiary-export`: a bundle is a case.
- `view-state`: the investigation key stops being a placeholder.
- `agent-integration`: both front-ends can create, list, open, fork, and export an investigation.

## Impact

- `packages/schema`: an `Investigation` and `Branch`; `Step` gains its scope; the graph seam takes it;
  view-state keys become real.
- `packages/engine`: the store partitions and replay scopes (shape decided by TDR-025); export takes
  an investigation; the operation surface grows the lifecycle.
- `packages/agent`: operations for the lifecycle, on both front-ends identically (I8).
- `apps/console`: a current investigation, and a way to switch and fork.
- Tests: scoping is airtight (a step in one case never appears in another's replay, queries, or
  export), a fork inherits its parent's history and diverges after, replay stays deterministic per
  case (I3), offline determinism holds per case (I11), and export contains one case and no more.
- **TDR-025 must be `decided` first.** It is a partition of the store TDR-005 chose and a new
  concept in the trail; neither should be implemented on a guess.

## Risks

- **[Scoping is a silent failure mode]** — a query that forgets its scope returns another case's data
  and looks like a normal answer. This codebase has produced three silent-wrong-answer bugs in a row
  (a browser inheriting another acquisition's proxy route, every artifact recorded with a placeholder
  content type, a transport capability claimed but never wired). → **Mitigated by the architecture
  that already exists**, per TDR-025's spike: every query reads the *projection* that `replay`
  rebuilds, not the log, so scope is enforced in one function and the reviewable surface is a single
  `SELECT` and a single `INSERT`. The cost is that the projection holds one case at a time —
  switching re-projects, measured at about half a second for a 60k-step case.
- **[Migration of the existing log]** — there is one unpartitioned log with real steps in it. It
  becomes one investigation, named for what it is: everything done before cases existed.
- **[Replay is already O(every step on the machine)]** — measured at ~8.4 s to fold 1.2M steps, and it
  degrades as *unrelated* work accumulates. → Not a risk of this change but a problem it fixes:
  scoping cuts both the read and the fold proportionally, so a 60k-step case replays in about half a
  second where the same database unscoped takes nine.
- **[Branch semantics are easy to over-build]** — merge, rebase, and conflict resolution are all
  tempting and none is asked for. The TDR's option D exists to be deferred, not adopted.
