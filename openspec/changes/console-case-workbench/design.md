## Context

See `proposal.md` — Why. Three constraints shape everything below.

**The console holds no domain vocabulary.** Entity kinds and identifier kinds are registered by packs
at runtime; the console must not learn that `hostname` means `domain`. This is the existing "built
from the deployment's own description" requirement, applied to two new places: matching transforms to
a node, and deciding a kind's columns.

**Nothing enters the graph un-attributed.** `insert` refuses any step not attributed to evidence, and
the log is append-only. So a value the investigator types cannot become a graph node, and no
judgement they record can remove one.

**`Entity` has no attribute bag.** It is `{id, identifiers, kind, spatialExtent, temporalExtent}`, and
`OntologyDefinition` is `Entity | Relation | Event` — an example instance, not a schema of fields.
Identifiers are therefore the only per-kind facts that exist.

## Goals / Non-Goals

**Goals:**
- One derivation of "what is in this case" from `replay` + `log`, with no second index to drift.
- Matching and column rules that are pure functions, so they can be tested without a browser.
- A design system whose contract is CSS, usable outside React.

**Non-Goals:**
- Changing the engine, the schema, or any pack. Everything is derived from existing operations.
- Persisting canvas layout. Nodes re-lay-out on each commit; sticky positions are separate work.
- A general charting or virtualisation layer. Row counts here are bounded by the existing render cap.

## Decisions

### The design system is CSS; the React layer only emits class names

Alternative considered: ship styled React components, as the source design kit did (inline `style`
objects, focus state in `useState`).

Rejected because a component whose focus ring lives in React state cannot be rendered by anything
that is not React, and cannot be styled by a browser without JavaScript. Making CSS the contract
means the same system serves the console, a static preview page, and any future surface. It also
gives the states a browser already owns — `:focus`, `:disabled`, `:hover` — back to the browser.

The cost is that a consumer must import a stylesheet as well as a component. That is one line.

### Cascade layers, and a namespace

All rules sit in `vk.tokens < vk.base < vk.components < vk.utilities`. Unlayered application styles
beat all four, so overriding never needs `!important`.

This has one sharp edge worth recording: an unlayered `button {}` in an application also outranks
`.vk-btn`. The console's own element defaults are therefore guarded against design-system classes. A
consuming app that styles bare elements must do the same, and the README says so.

Namespacing (`vk-`, `--vk-`) is what makes the system safe to drop into an app that already has a
`.grid` or a `.panel`.

### TanStack Table lives in the console, not in the design system

The table needs sorting and dynamic columns. TanStack Table v9 is headless: it owns the row model and
the consumer owns every element, class and ARIA attribute — the same division the design system
draws, so they compose without either knowing about the other.

It is a console dependency deliberately. Putting a React table library inside `@viokit/ui` would
break the property that makes the system worth having: that it works without React.

### Transform-to-node matching is name equality, and a near miss is a suggestion

A transform's inputs are named (`domain`, `hostname`); a node carries identifier kinds and an entity
kind. A match is name equality against either. Anything else is offered only when the transform takes
exactly one required string, pre-filled and flagged as needing confirmation.

Alternative considered: an alias table (`hostname` ≈ `domain`). Rejected — that is domain vocabulary,
it would be wrong for some pack eventually, and the failure mode is silently putting the wrong value
into a live query against a third party. Two unmatched required inputs are not guessed at at all,
because there is no honest way to choose which one the node fills.

### The seed is canvas state, not graph state

A typed value is drawn as unevidenced and is not committed. It is superseded when any entity carries
that value as its id or on an identifier — which is what happens the first time a transform asserts
the thing that was asked about, since projections assert their input entity.

Alternative considered: ingest the typed value as manual evidence and commit an `AddEntity` step
attributed to it. That is honest and the operations exist, but it would require the console to
construct an entity — choosing its id and kind — which is exactly the domain knowledge it must not
hold. Left available as a later, explicit "record this as an assertion" action.

### Curation is view state, not graph state

Keep/defer/discard is a judgement about what is worth following, not a fact about the world, and the
log cannot be unsaid. It is persisted through the existing view-state surface, which is already keyed
per user, investigation and surface — so judgements are naturally scoped to a case.

`redact` was considered and rejected for this: it withholds an artifact from exports, which is a
different act with different consequences.

The word "discard" is the risk here; the interface states what it does rather than relying on the
word being read carefully.

### Per-kind columns are derived from identifiers

A kind's columns are the identifier kinds its entities carry, ordered by how many carry them. This
keeps the open-domain rule intact: a pack decides a kind's columns by choosing what it attaches, and
a newly registered pack works with no console change.

Only shown when the table is narrowed to one kind — a mixed table can only honestly show what every
entity has.

Imagery is decided from the value's shape (an `http(s)` URL with an image extension, or a `data:image`
URL), never from the field's name. That a value *is* an image is a fact; "a field called `photo` holds
a picture" is a guess about someone else's vocabulary. A column qualifies only if every value it
actually holds is an image, so a half-populated column of strings is not rendered as broken images.

### Derivation is one pure module over `replay` + `log`

`replay` gives the folded graph; `log` gives each step's source, transform and evidence. Corroboration
(distinct sources), first-appearance, and degree are all derived from those two, per read. No cached
index, because an index that disagreed with the log would be worse than a slow one.

## Risks / Trade-offs

- **Identifiers used as an attribute store** → The derivation works today and is the only option, but
  identifiers are meant to be identifying values: no types, no ordering, no display-name, and every
  attribute becomes a candidate merge key for entity resolution. Recorded in the proposal as a known
  limitation; the derivation is written as the seam where a real attribute source would attach.
- **Rendering a URL from a third party as an `<img>`** → The gallery fetches whatever a source
  returned, which is a request to an origin the investigator did not choose and a possible tracking
  signal. Restricted to `http(s)` and `data:` and gated behind an explicit toggle, but a deployment
  that must not make such requests needs a policy, not a heuristic. Worth a follow-up.
- **Canvas re-lays-out on every commit** → Nodes move after each expansion, which costs the
  investigator their spatial memory. Accepted for now; sticky positions are separate work.
- **Column derivation is per-render over the shown rows** → Fine at the existing render cap; would
  need memoising or virtualising well before a case reached thousands of entities.
- **View-state payload grows with the case** → Curation is one entry per judged entity. Bounded by
  how much an investigator actually judges, and older documents degrade to defaults by version.

## Migration Plan

The view-state payload goes from version 4 to 5, adding the case selection and the curation map. No
migration is written: `view-state` already requires that a document which cannot be understood reads
as absent, so a version-4 document yields defaults and the console starts clean. Judgements are not
lost, because none existed before this change.

Rolling back is removing the package and reverting the console; nothing in the engine, the schema or
any pack changed, and no stored engine state depends on this.
