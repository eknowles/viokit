## ADDED Requirements

### Requirement: Selecting a node shows what produced it
Selecting a node in the graph SHALL show the steps that produced that entity and the evidence each
step was attributed to, including how that evidence was acquired, so the graph is a route into the
record rather than a picture beside it.

#### Scenario: A node's provenance is shown
- **WHEN** an investigator selects a node that was committed by a transform
- **THEN** the steps naming that entity are shown, each with the evidence it was attributed to

#### Scenario: Acquisition is visible
- **WHEN** provenance is shown for evidence acquired by a particular route
- **THEN** that route is stated — fetched live, served from cache, proxied, or retrieved by a person

#### Scenario: A node with no recorded steps says so
- **WHEN** an investigator selects a node for which no step can be found
- **THEN** the panel reports that rather than appearing to show a complete trail
