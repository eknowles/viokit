## ADDED Requirements

### Requirement: The bundle's own record is covered by a digest
An export SHALL record a digest of its tag files — the BagIt declaration, the payload manifest, and
the manifest carrying steps, custody and withheld material — so the trail cannot be altered without
detection.

#### Scenario: The tag manifest is present whether or not the bundle is signed
- **WHEN** an investigation is exported
- **THEN** the bundle records a digest for each of its tag files

#### Scenario: Altering the trail is detectable
- **WHEN** the manifest carrying steps and custody is altered after export
- **THEN** its recorded digest no longer matches

### Requirement: A bundle may be signed, and says which it is
An export SHALL sign its tag manifest where the deployment holds a signing key, and SHALL state in the
manifest whether it is signed, under what algorithm, and how to verify it.

#### Scenario: An unsigned bundle declares itself unsigned
- **WHEN** a deployment with no signing key exports an investigation
- **THEN** the manifest states that the bundle is not signed

#### Scenario: A signed bundle carries a detached signature and the key it used
- **WHEN** a deployment holding a signing key exports an investigation
- **THEN** the bundle carries a detached signature over its tag manifest
- **AND** the manifest records the algorithm and the key's fingerprint

#### Scenario: A recipient verifies without this software
- **WHEN** a recipient checks a signed bundle with standard cryptographic tooling
- **THEN** the signature verifies

#### Scenario: A repaired tag manifest does not pass
- **WHEN** the trail is altered and the tag manifest is regenerated to match
- **THEN** the signature no longer verifies

#### Scenario: The bundle does not overstate what a signature proves
- **WHEN** a signed bundle is read
- **THEN** it states that verifying against the key it carries shows consistency, not who produced it
