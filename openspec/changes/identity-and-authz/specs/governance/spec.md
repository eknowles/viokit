## ADDED Requirements

### Requirement: Every operation runs as a principal
The system SHALL resolve who is acting before running any operation, identically on every front-end
(I8), and SHALL treat an agent as a principal in its own right so the record can say which one acted.

#### Scenario: A deployment that authenticates nobody has one local operator
- **WHEN** no principals are configured
- **THEN** operations run as a single local operator

#### Scenario: A configured credential resolves to its principal
- **WHEN** a caller presents a credential this deployment recognises
- **THEN** the operation runs as that principal

#### Scenario: An unrecognised credential is refused
- **WHEN** a caller presents a credential this deployment does not recognise
- **THEN** the operation is refused

#### Scenario: Once a deployment authenticates, presenting nothing is not enough
- **WHEN** a deployment has principals configured and a caller presents no credential
- **THEN** the operation is refused, rather than falling back to a local operator

### Requirement: An unauthenticated deployment stays on loopback
The system SHALL refuse to serve on a non-loopback address unless it can identify who is calling, and
SHALL say what would allow it.

#### Scenario: A wide bind without authentication is refused
- **WHEN** a deployment that authenticates nobody is asked to serve on a non-loopback address
- **THEN** it refuses, naming what would let it through

#### Scenario: Loopback is always allowed
- **WHEN** a deployment is asked to serve on loopback
- **THEN** it serves, whether or not it authenticates

#### Scenario: A deployment that authenticates may bind wider
- **WHEN** a deployment with principals configured is asked to serve on a non-loopback address
- **THEN** it serves

### Requirement: An investigation is reachable only by its members
The system SHALL restrict an investigation to the principals admitted to it. Creating one SHALL make
the creator its owner and sole member.

#### Scenario: A case you are not party to cannot be opened
- **WHEN** a principal opens an investigation they are not a member of
- **THEN** it is refused
- **AND** the refusal is distinguishable from the case being empty

#### Scenario: A case you are not party to is not listed
- **WHEN** a principal lists investigations
- **THEN** only those they may reach appear

#### Scenario: A case you are not party to cannot be branched
- **WHEN** a principal branches an investigation they are not a member of
- **THEN** it is refused

#### Scenario: Only the owner admits others
- **WHEN** a principal who is not the owner admits someone to an investigation
- **THEN** it is refused

#### Scenario: An admitted principal can then reach the case
- **WHEN** an owner admits a principal to an investigation
- **THEN** that principal can open it, and it appears in their listing

#### Scenario: Only the owner discards
- **WHEN** a member who is not the owner discards an investigation
- **THEN** it is refused

#### Scenario: A branch belongs to whoever took it
- **WHEN** a member branches an investigation
- **THEN** they own the branch
- **AND** the parent's owner is not automatically party to it
