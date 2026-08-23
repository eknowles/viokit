## ADDED Requirements

### Requirement: Relations and events are selectable
The console SHALL let an investigator select a relation or an event in the graph, not only an entity,
so every kind of assertion the graph holds can be inspected.

#### Scenario: A relation can be selected
- **WHEN** an investigator selects a relation in the graph
- **THEN** what it asserts, the entities it connects, and its period are shown

#### Scenario: An event appears and can be selected
- **WHEN** the graph contains an event
- **THEN** it is drawn, distinguished from an entity, connected to the entities it involves, and can be selected

#### Scenario: One subject is selected at a time
- **WHEN** an investigator selects a second subject
- **THEN** the first is no longer selected

### Requirement: Provenance is shown for whichever subject is selected
The steps and evidence behind a selection SHALL be shown for a relation or an event exactly as for an
entity, and SHALL be the steps that asserted *that* subject rather than steps merely mentioning
something near it.

#### Scenario: A relation's provenance is its own
- **WHEN** an investigator selects a relation
- **THEN** the steps shown are those that asserted that relation

#### Scenario: A subject with no recorded steps says so
- **WHEN** a selected relation or event has no step naming it
- **THEN** the panel reports that rather than appearing to show a complete trail
