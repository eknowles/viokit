## ADDED Requirements

### Requirement: The catalog says which classifications were checked
A source entry SHALL report whether its access classification was verified against the source or is a
declaration nobody checked, so an unchecked source does not read as a checked one.

#### Scenario: An unchecked classification is reported as unverified
- **WHEN** the catalog lists a source whose spec carries no verification evidence
- **THEN** the entry reports its classification as unverified

#### Scenario: A checked classification is reported as verified
- **WHEN** the catalog lists a source whose spec carries the evidence it was classified from
- **THEN** the entry reports its classification as verified
