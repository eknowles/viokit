## ADDED Requirements

### Requirement: Material can be withheld without altering the record
The system SHALL allow an artifact to be withheld from an investigation by recording that decision,
and SHALL NOT alter or remove any artifact or step in doing so (I1, I3).

#### Scenario: Withholding leaves the artifact and the history intact
- **WHEN** an artifact is withheld from an investigation
- **THEN** the artifact is unchanged
- **AND** the steps that cite it are unchanged

#### Scenario: A withholding is attributable
- **WHEN** an artifact is withheld
- **THEN** the record carries who withheld it, when, on what ground, and why

#### Scenario: Withholding is appended, not replaced
- **WHEN** a second artifact is withheld from the same investigation
- **THEN** the first withholding is still recorded

#### Scenario: A withholding outlives the process that made it
- **WHEN** an artifact is withheld and the deployment is restarted
- **THEN** it is still withheld

### Requirement: An export declares what it withholds
An evidentiary export SHALL omit the bytes of withheld artifacts and SHALL name each one, with its
reason, in the manifest. It SHALL NOT silently produce a smaller bundle.

#### Scenario: Withheld bytes do not travel
- **WHEN** an investigation with a withheld artifact is exported
- **THEN** the bundle does not contain that artifact's bytes

#### Scenario: The recipient learns something was withheld
- **WHEN** an investigation with a withheld artifact is exported
- **THEN** the manifest names the artifact, its ground, and the stated reason

#### Scenario: Claims still show what they rest on
- **WHEN** an investigation with a withheld artifact is exported
- **THEN** the steps citing it are still present in the bundle

#### Scenario: One investigation's withholdings do not affect another
- **WHEN** an artifact is withheld from one investigation and cited by another
- **THEN** the other investigation's export is unaffected
