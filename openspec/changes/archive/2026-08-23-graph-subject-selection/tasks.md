# Tasks — Graph Subject Selection

> Finishes the trail: relations and events reachable as entities already are. No engine changes.

## 1. Layout

- [x] 1.1 Events join the layout as their own node kind, with edges to the entities they involve.
- [x] 1.2 The time filter applies to events as it does to entities.
- [x] 1.3 Tests: an event appears with its edges; an event outside the selected moment is excluded.

## 2. Selection

- [x] 2.1 Selection carries a subject — entity, relation, or event — rather than an entity id.
- [x] 2.2 Edges are selectable; one subject is selected at a time.
- [x] 2.3 The selected subject joins the persisted view state; bump its version.

## 3. Provenance

- [x] 3.1 Resolve steps by subject identity, so a relation finds the steps that asserted it.
- [x] 3.2 Tests: a relation's steps are its own; an entity's are unchanged; a subject with no steps is reported.

## 4. Detail

- [x] 4.1 Render detail per kind: an entity's identifiers, a relation's type and endpoints, an event's kind and participants — each with its period.

## 5. Verification

- [x] 5.1 Typechecks, suites, lint clean via devbox.
- [x] 5.2 Drive it live: commit a transform, select the relation it produced, and read its provenance.
