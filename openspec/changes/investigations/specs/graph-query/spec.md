## MODIFIED Requirements

### Requirement: Queries answer for an investigation
Path, timeline, spatial, and relatedness queries SHALL be answered within one investigation, so a
result never mixes work from separate cases.

#### Scenario: A path stays within its case
- **WHEN** a path is requested between two entities in an investigation
- **THEN** every edge on the returned path was recorded in that investigation

#### Scenario: Relatedness ranks within its case
- **WHEN** relatedness is requested from a seed in an investigation
- **THEN** only entities reachable within that investigation are ranked

#### Scenario: An entity known to two cases is answered separately in each
- **WHEN** the same entity appears in two investigations
- **THEN** a query in one reflects only what that investigation recorded about it
