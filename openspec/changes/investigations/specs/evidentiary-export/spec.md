## MODIFIED Requirements

### Requirement: A bundle is one investigation
An evidentiary export SHALL contain one investigation's claims, steps, evidence, and raw bytes, and
nothing else. Exporting SHALL NOT disclose work belonging to any other investigation.

#### Scenario: A bundle carries the case and its trail
- **WHEN** an investigation is exported
- **THEN** the bundle contains its claims, the steps that produced them, and the artifacts those steps
  cite

#### Scenario: A bundle carries nothing else
- **WHEN** an investigation is exported while other investigations exist on the same deployment
- **THEN** the bundle contains no step, claim, or artifact belonging to another

#### Scenario: A recipient can still verify it alone
- **WHEN** a bundle is handed to a recipient who runs none of this software
- **THEN** every artifact still verifies against its own identifier
