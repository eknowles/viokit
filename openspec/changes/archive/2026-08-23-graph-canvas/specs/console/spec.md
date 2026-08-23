## ADDED Requirements

### Requirement: The console renders the graph
The console SHALL present the investigation graph visually — entities as nodes and relations as the
edges between them — so an investigator can see its shape rather than read it as rows.

#### Scenario: A committed graph is drawn
- **WHEN** an investigator opens the graph view after steps have been committed
- **THEN** the entities appear as nodes and the relations as edges between them

#### Scenario: An empty graph says so
- **WHEN** the graph view is opened for an investigation with nothing committed
- **THEN** it reports that the graph is empty rather than showing a blank canvas

### Requirement: The graph can be viewed at a moment in time
The console SHALL let an investigator restrict the graph to what was valid at a chosen time, using
the temporal extents the data already carries, so a graph that changes over time can be read at a
point rather than only in aggregate.

#### Scenario: Filtering to a moment hides what was not yet valid
- **WHEN** the investigator selects a time before an entity's validity began
- **THEN** that entity is not shown

#### Scenario: Filtering to a moment shows what was valid then
- **WHEN** the investigator selects a time within an entity's validity
- **THEN** that entity is shown

#### Scenario: Unfiltered shows everything
- **WHEN** no time is selected
- **THEN** the whole graph is shown regardless of temporal extent

### Requirement: Selecting a node reveals what it is
Selecting a node SHALL show that entity's detail — its kind, its identifiers, and its temporal
extent — so the graph is a route into the underlying record rather than a picture beside it.

#### Scenario: A selected node shows its detail
- **WHEN** an investigator selects a node
- **THEN** the entity's kind, identifiers, and temporal extent are shown

#### Scenario: Selection can be cleared
- **WHEN** an investigator dismisses the selection
- **THEN** no node is shown as selected and the detail is hidden

### Requirement: A truncated graph says that it is truncated
Where the graph exceeds what the view will render, the console SHALL render a bounded subset and
SHALL state that it has done so and by how much. It SHALL NOT present a subset as though it were the
whole graph.

#### Scenario: Truncation is reported
- **WHEN** the graph contains more entities than the view renders
- **THEN** the view states that it is showing a subset and how many were omitted

#### Scenario: A graph within the bound is not reported as truncated
- **WHEN** the graph fits within the bound
- **THEN** no truncation message is shown
