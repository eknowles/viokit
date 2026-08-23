## ADDED Requirements

### Requirement: Exporting is available to every front-end
The operations SHALL include exporting an investigation as a bundle, so any front-end can produce one
through the same service as everything else (I8).

#### Scenario: A front-end exports an investigation
- **WHEN** a caller invokes the export operation
- **THEN** a bundle is produced and its location and contents are reported

#### Scenario: Exporting does not alter the investigation
- **WHEN** an investigation is exported
- **THEN** no step is appended and no evidence is written
