# View State

## Purpose

Keeps each surface's configuration — layout, filters, selection — durable across sessions and separate
from the evidentiary record, so an investigator returns to where they were without any of that
configuration entering the trail of how an investigation was built.

## Requirements

### Requirement: View state is stored per user, investigation, and surface
View state SHALL be stored under a key identifying the user, the investigation, and the surface it
belongs to, so two surfaces, two investigations, or two users never read each other's state.

#### Scenario: State round-trips for its own key
- **WHEN** view state is saved for a key and later loaded for the same key
- **THEN** the loaded state equals what was saved

#### Scenario: Keys are isolated
- **WHEN** view state is saved for one surface, investigation, or user
- **THEN** loading any other key does not return it

#### Scenario: An unsaved key loads as absent
- **WHEN** view state is loaded for a key never written
- **THEN** the result reports absence rather than failing

### Requirement: View state is schema-encoded and versioned
A stored document SHALL carry a version and SHALL be validated when it is loaded, so a document
written by an older surface can be recognised rather than misread (I6).

#### Scenario: A stored document carries its version
- **WHEN** view state is saved
- **THEN** the stored document records the version it was written under

#### Scenario: A document that fails validation yields defaults
- **WHEN** a stored document cannot be decoded, or was written under a version the surface no longer
  understands
- **THEN** loading reports absence so the surface starts from its defaults, and the surface remains usable

### Requirement: View state is kept out of the evidentiary record
View state SHALL NOT be written to the step log, SHALL NOT be stored with evidence, and SHALL NOT
appear in a replay of an investigation. Saving or loading it SHALL NOT alter graph state (I3, I12).

#### Scenario: Saving view state appends no step
- **WHEN** view state is saved
- **THEN** the step log is unchanged and no evidence is written

#### Scenario: Replay is unaffected by view state
- **WHEN** an investigation is replayed after view state has been saved
- **THEN** the replayed graph is identical to the replay before it was saved
