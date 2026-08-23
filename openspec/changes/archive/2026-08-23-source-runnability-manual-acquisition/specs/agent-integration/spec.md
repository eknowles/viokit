## ADDED Requirements

### Requirement: Catalog entries report runnability
A source entry in the catalog SHALL state whether this deployment can actually acquire it, and when
it cannot, the reason. Listings SHALL filter on runnability, so a caller can ask for what is usable
here rather than reading a flat list in which unusable sources are indistinguishable.

#### Scenario: An unusable source is marked and explained
- **WHEN** the catalog lists a source classified as browser-only in a deployment with no browser
  transport
- **THEN** that entry reports that it is not runnable, and gives the reason

#### Scenario: Listings narrow to what is usable
- **WHEN** the catalog is listed filtered to runnable sources
- **THEN** only sources this deployment can acquire are returned

#### Scenario: Registration is still reported in full
- **WHEN** the catalog is listed without a runnability filter
- **THEN** registered sources are returned whether or not they are runnable, each carrying its status

### Requirement: Evidence can be submitted through the front-ends
Both front-ends SHALL expose an operation that submits externally acquired bytes as evidence, so a
source the engine cannot fetch can still be used: a person or an agent retrieves the artifact and
submits it, recorded as manually acquired with its retriever (I9). The submission SHALL be decoded
at the boundary (I6) and stored content-addressed and write-once like any other evidence (I1).

#### Scenario: Manually retrieved bytes become evidence
- **WHEN** a caller submits retrieved bytes with a retriever and origin through either front-end
- **THEN** the evidence is stored, its acquisition path records the manual retrieval, and its
  identity is the content hash

#### Scenario: The same submission on either surface behaves identically
- **WHEN** the same submission is made through the agent surface and the human surface
- **THEN** both produce the same stored evidence and the same identity

#### Scenario: A malformed submission is rejected
- **WHEN** a submission omits its retriever or carries a payload that fails decoding
- **THEN** the call returns an error and no evidence is stored

#### Scenario: Submitted evidence is usable by the rest of the surface
- **WHEN** evidence submitted this way is referenced by a step committed through the front-end
- **THEN** the commit is accepted, because the step is attributed to stored evidence (I2)
