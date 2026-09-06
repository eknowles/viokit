## ADDED Requirements

### Requirement: A case is started from a value the investigator supplies
The console SHALL let an investigator begin a case from a value they already know, placed on the
canvas as a starting point. Because the engine accepts no assertion that is not attributed to
evidence, that value SHALL NOT enter the graph by being typed. It SHALL be shown as distinct from
everything the graph holds, and SHALL be replaced by the real entity once a transform asserts it.

#### Scenario: A typed value becomes a starting point, not a finding
- **WHEN** an investigator seeds a case with a value
- **THEN** it appears on the canvas marked as not yet evidenced, and the graph is unchanged

#### Scenario: The seed is superseded once something asserts it
- **WHEN** a transform run from the seed asserts an entity carrying that value
- **THEN** the seed is replaced by that entity

#### Scenario: A seed that nothing asserted remains a seed
- **WHEN** a transform run from the seed returns without asserting that value
- **THEN** the seed is still shown as not yet evidenced

### Requirement: A node offers the transforms that can be run from it
Selecting a node SHALL show which published transforms can be run from it, with the node's value
already placed in the input it fills. The console SHALL determine this by name equality between a
transform's declared inputs and the node's identifier kinds or entity kind, and SHALL NOT rely on
knowledge of any particular domain vocabulary.

#### Scenario: A transform whose input matches the node is offered as an exact fit
- **WHEN** a node carries an identifier whose kind matches a transform's required input
- **THEN** that transform is offered with the input filled from that identifier

#### Scenario: A near miss is offered for confirmation rather than assumed
- **WHEN** a transform requires a single input that nothing on the node is named for
- **THEN** it is offered with the value pre-filled and marked as needing confirmation

#### Scenario: An ambiguous match is not guessed at
- **WHEN** a transform requires more than one input and nothing on the node is named for any of them
- **THEN** it is not offered, because there is no honest way to decide which input the node fills

#### Scenario: A pre-filled input remains editable
- **WHEN** a transform is offered with a pre-filled input
- **THEN** the investigator can change it before running

#### Scenario: A node with nothing to expand says so
- **WHEN** no published transform takes a value the node can fill
- **THEN** the console reports that rather than showing an empty list

### Requirement: Expanding a node reports what it actually added
Committing the steps produced by an expansion SHALL report how many entities the graph gained. Where
everything returned was already held, the console SHALL say so rather than reporting a count of
committed steps, which would imply a finding.

#### Scenario: New entities are counted
- **WHEN** an expansion is committed and the graph gains entities
- **THEN** the number gained is reported

#### Scenario: A transform that found nothing new says so
- **WHEN** an expansion is committed and every entity returned was already in the graph
- **THEN** the console states that nothing new was found

### Requirement: An investigator can record a judgement about each entity
The console SHALL let an investigator mark an entity as kept, deferred or discarded, and SHALL
persist those judgements as view state. Because the log is append-only and every entity in it is
attributed to evidence, discarding SHALL hide an entity from the investigator's own view only: the
entity SHALL remain in the graph, in the log, and in any export, and the console SHALL make that
plain rather than letting the action read as deletion.

#### Scenario: A judgement is recorded and survives a reload
- **WHEN** an investigator marks an entity and later reloads the console
- **THEN** the entity is still shown with that judgement

#### Scenario: Discarding does not alter the record
- **WHEN** an entity is discarded
- **THEN** it remains present in the graph and the log

#### Scenario: A judgement can be undone
- **WHEN** an investigator repeats the judgement an entity already carries
- **THEN** the entity returns to being unreviewed

#### Scenario: Judgements do not leak between cases
- **WHEN** the open investigation changes
- **THEN** judgements recorded about entities the new case does not hold are not applied to it

### Requirement: The case can be read as a table in three states
The console SHALL present the case's contents as a table showing either every entity, the entities of
one kind, or the relations between them, and SHALL let the investigator sort it.

#### Scenario: Every entity can be listed together
- **WHEN** the investigator asks for everything in the case
- **THEN** all entities are listed with the attributes every entity has

#### Scenario: The table can be narrowed to one kind
- **WHEN** the investigator selects an entity kind
- **THEN** only entities of that kind are listed

#### Scenario: Relations can be listed
- **WHEN** the investigator asks for relations
- **THEN** each relation is listed with what it asserts and the entities at each end

#### Scenario: A kind that leaves the case does not strand the table
- **WHEN** the table is narrowed to a kind and the case no longer holds any entity of it
- **THEN** the table returns to showing everything rather than showing nothing

### Requirement: A kind's columns are derived from its own entities
Where the table is narrowed to one kind, the console SHALL derive that kind's columns from the
identifiers those entities carry, so that registering a pack changes what the table shows with no
change to the console. It SHALL NOT hold a per-kind column list of its own.

#### Scenario: A kind's identifiers become its columns
- **WHEN** the table is narrowed to a kind whose entities carry several identifier kinds
- **THEN** a column appears for each

#### Scenario: A mixed table shows only what every entity has
- **WHEN** the table shows entities of more than one kind
- **THEN** only the attributes every entity has are shown as columns

#### Scenario: A value that does not fit its cell is not silently dropped
- **WHEN** an entity carries more than one identifier of the same kind
- **THEN** the cell shows one and reports that further values exist

### Requirement: Entities whose values are images can be shown as images
Where every value in a derived column is an image, the console SHALL offer to show those entities as
their imagery instead of as rows. It SHALL decide this from the values themselves and SHALL NOT infer
it from what a field is named.

#### Scenario: A column of images can be shown as a gallery
- **WHEN** every value in a derived column is an image
- **THEN** the investigator can view those entities as their images

#### Scenario: A field named for imagery but not holding it stays a column of text
- **WHEN** a column's name suggests imagery but its values are not images
- **THEN** no gallery is offered

#### Scenario: A partly populated column is judged on what it holds
- **WHEN** some entities carry a column's value and all of those values are images
- **THEN** a gallery is offered, and entities without the value are shown without one

### Requirement: The canvas distinguishes what it is showing
The console SHALL distinguish entities on the canvas by kind, and SHALL provide a key to that
distinction. It SHALL label a node by the value that identifies it rather than by its internal
identifier, and SHALL reflect the investigator's judgements.

#### Scenario: Kinds are distinguishable and decodable
- **WHEN** a case holds entities of more than one kind
- **THEN** the kinds are visually distinguished and a key states which is which

#### Scenario: A node reads as what it is
- **WHEN** an entity carries an identifying value
- **THEN** the node is labelled with it

#### Scenario: A discarded entity recedes without vanishing
- **WHEN** an entity has been discarded
- **THEN** it and its relations are de-emphasised on the canvas but still drawn

### Requirement: A selection is shared across the case surfaces
Selecting an entity on any of the case's surfaces SHALL select it on all of them, so the canvas, the
table and the detail panel always describe the same entity.

#### Scenario: Selecting in the table selects on the canvas
- **WHEN** an investigator selects a row in the case table
- **THEN** the corresponding node is selected on the canvas

#### Scenario: Selecting on the canvas selects in the table
- **WHEN** an investigator selects a node on the canvas
- **THEN** the corresponding row is selected in the table

### Requirement: The case reports what it is made of
Where nothing is selected, the console SHALL report the case's composition — how many entities and
relations it holds, how many were returned by more than one source, how many remain unreviewed, and
the breakdown by kind and by source — so an investigator returning to a case can see its shape
without reading it row by row.

#### Scenario: Composition is available without selecting anything
- **WHEN** an investigator opens a case and selects nothing
- **THEN** its totals and its breakdown by kind and by source are shown

#### Scenario: What arrived most recently is distinguishable
- **WHEN** an expansion has added entities to the case
- **THEN** those entities are distinguishable from what was already held
