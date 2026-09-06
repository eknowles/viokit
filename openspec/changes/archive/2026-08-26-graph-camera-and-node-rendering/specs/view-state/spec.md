## ADDED Requirements

### Requirement: The graph camera is view state
The camera the investigator was looking through — its position and zoom — SHALL be persisted as view
state keyed by investigation, so that reopening a case returns to the view it was left at rather than
to a default frame.

#### Scenario: The camera survives reopening
- **WHEN** an investigator pans or zooms the graph, leaves the case, and returns to it
- **THEN** the graph is framed as it was left

#### Scenario: Each investigation has its own camera
- **WHEN** an investigator moves the camera in one investigation and opens another
- **THEN** the second investigation's graph is framed by its own camera, not the first's

#### Scenario: A case never seen before opens framed
- **WHEN** an investigation with no stored camera is opened
- **THEN** the graph opens framed to fit rather than at an arbitrary position

#### Scenario: The camera is persisted server-side
- **WHEN** the camera is persisted
- **THEN** it is written through the view-state store and not to browser-local storage
