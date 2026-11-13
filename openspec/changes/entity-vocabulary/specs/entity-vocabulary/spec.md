## Purpose

Gives every pack one shared list of entity kinds and relation types, so tools written independently produce entities that connect in the same investigation tree instead of duplicating each other.

## ADDED Requirements

### Requirement: There is one shared vocabulary
The system SHALL define the entity kinds and relation types that packs may use in one place, each with a description, and SHALL NOT place that list in core.

#### Scenario: A kind is described
- **WHEN** the vocabulary is read
- **THEN** each entity kind and each relation type has a name and a description

#### Scenario: Core holds no domain types
- **WHEN** the core packages are inspected
- **THEN** they contain no entity kind or relation type from the vocabulary

### Requirement: Packs may only use vocabulary names
The system SHALL fail a check when a pack other than the vocabulary pack uses an entity kind or a relation type that the vocabulary does not define, and SHALL name the file, the line and the unknown name.

#### Scenario: A pack invents a kind
- **WHEN** a pack's projection builds an entity with a kind not in the vocabulary
- **THEN** the check fails and names the file, line and kind

#### Scenario: A pack invents a relation type
- **WHEN** a pack's projection links two entities with a relation type not in the vocabulary
- **THEN** the check fails and names the file, line and relation type

#### Scenario: Existing packs pass
- **WHEN** the check runs on the current packs
- **THEN** it passes

#### Scenario: Unrelated kind-like fields are not flagged
- **WHEN** a pack declares a field named kind whose value is a tool classification such as passive or active
- **THEN** the check does not flag it

### Requirement: The check proves it can fail
The system SHALL include a fixture that uses unknown names and SHALL fail its own test run if the check does not flag that fixture.

#### Scenario: The check goes silent
- **WHEN** the check is changed so the violating fixture is no longer flagged
- **THEN** the control test fails

### Requirement: Only a steward change may edit the vocabulary
The system SHALL fail a change that modifies the vocabulary unless the guard is run with the steward flag, and SHALL leave the orchestrator to pass that flag only for changes named as vocabulary changes.

#### Scenario: A tool change edits the vocabulary
- **WHEN** a change for a tool modifies the vocabulary and the guard runs without the flag
- **THEN** the guard fails and names the file

#### Scenario: A steward change edits the vocabulary
- **WHEN** a vocabulary change modifies the vocabulary and the guard runs with the flag
- **THEN** the guard passes that file

#### Scenario: A vocabulary change touches something else protected
- **WHEN** a vocabulary change modifies a conformance rule and the guard runs with the flag
- **THEN** the guard still fails on the conformance rule
