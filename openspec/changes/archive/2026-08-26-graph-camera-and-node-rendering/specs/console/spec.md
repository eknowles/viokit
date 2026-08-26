## ADDED Requirements

### Requirement: The graph can be navigated
The console SHALL let an investigator pan and zoom the graph, and SHALL provide a way to return to a
view that frames the whole graph, so a graph larger than the viewport can be read rather than merely
displayed.

#### Scenario: The graph can be panned
- **WHEN** an investigator drags the graph surface
- **THEN** the view moves and nodes outside the original viewport become reachable

#### Scenario: The graph can be zoomed
- **WHEN** an investigator zooms in
- **THEN** the graph is drawn larger and the point under the pointer stays under the pointer

#### Scenario: The whole graph can be reframed
- **WHEN** an investigator asks to fit the graph to the view
- **THEN** every rendered node is within the viewport

#### Scenario: Navigating does not change what is selected
- **WHEN** an investigator pans or zooms while a node is selected
- **THEN** the same node remains selected and its detail remains shown

### Requirement: Nodes are rendered according to their entity kind
The console SHALL render a node using a presentation resolved from its entity kind — its label, and
where described, an icon or image, a colour, and a badge — so that what a node stands for is legible
from the graph rather than only from its detail panel.

#### Scenario: A described kind renders with its presentation
- **WHEN** the graph contains an entity of a kind that has a view spec
- **THEN** that node is rendered with the label, image, and colour the spec describes

#### Scenario: Two kinds are distinguishable
- **WHEN** the graph contains entities of two different kinds
- **THEN** their nodes are visually distinguishable from each other without selecting either

#### Scenario: An undescribed kind still renders
- **WHEN** the graph contains an entity of a kind that no view spec describes
- **THEN** the node is rendered with the generic presentation and its kind is still shown

#### Scenario: The encoding is decodable
- **WHEN** kinds are distinguished by colour or icon in the graph
- **THEN** a legend states what each colour or icon means

#### Scenario: The graph follows the theme
- **WHEN** the console's theme changes while the graph is displayed
- **THEN** the graph is redrawn in the new theme's colours rather than retaining the previous theme's

### Requirement: A tree-shaped graph is laid out as a tree
Where the graph is hierarchical, the console SHALL lay it out so that the hierarchy is visible, and
SHALL keep disconnected components separated rather than overlapping.

#### Scenario: An expansion reads as a hierarchy
- **WHEN** a graph consists of a root entity and the entities derived from it
- **THEN** the derived entities are placed so that the direction of derivation is apparent

#### Scenario: Separate components do not overlap
- **WHEN** the graph contains two components with no relation between them
- **THEN** the two components are laid out without overlapping each other

#### Scenario: The layout in use is stated
- **WHEN** the graph is drawn
- **THEN** the console states which layout produced it

#### Scenario: Layout is deterministic
- **WHEN** the same graph is laid out twice with the same layout
- **THEN** the positions produced are the same

## MODIFIED Requirements

### Requirement: A truncated graph says that it is truncated
Where the graph exceeds the bound the view will render, the console SHALL render a bounded subset and
SHALL state that it has done so and by how much. It SHALL NOT present a subset as though it were the
whole graph. The bound SHALL be a configured value rather than a literal, so that raising it cannot
silently disable the report.

#### Scenario: Truncation is reported
- **WHEN** the graph contains more entities than the configured bound
- **THEN** the view states that it is showing a subset and how many were omitted

#### Scenario: A graph within the bound is not reported as truncated
- **WHEN** the graph fits within the bound
- **THEN** no truncation message is shown

#### Scenario: Raising the bound does not disarm the report
- **WHEN** the bound is raised and a graph still exceeds it
- **THEN** the view still states that it is showing a subset and how many were omitted

#### Scenario: The retained subset is the most connected
- **WHEN** the graph exceeds the bound
- **THEN** the entities retained are those with the most relations

### Requirement: Selecting a node reveals what it is
Selecting a node SHALL show that entity's detail — its kind, its identifiers, and its temporal
extent — so the graph is a route into the underlying record rather than a picture beside it. The graph
SHALL be operable by keyboard alone, SHALL expose which node is selected to assistive technology, and
SHALL indicate visually which node keyboard focus is on. These SHALL hold regardless of the rendering
technology; the graph is not permitted to be the one surface in the console a keyboard cannot use.

#### Scenario: A selected node shows its detail
- **WHEN** an investigator selects a node
- **THEN** the entity's kind, identifiers, and temporal extent are shown

#### Scenario: Selection can be cleared
- **WHEN** an investigator dismisses the selection
- **THEN** no node is shown as selected and the detail is hidden

#### Scenario: The graph is operable by keyboard
- **WHEN** an investigator moves through the graph by keyboard
- **THEN** each rendered node can be reached and selected without a pointer

#### Scenario: Keyboard focus is visible
- **WHEN** keyboard focus is on a node
- **THEN** that node is visually indicated as focused

#### Scenario: Selected state is exposed assistively
- **WHEN** a node is selected
- **THEN** its selected state and a label naming the entity are available to assistive technology

#### Scenario: A selectable edge is reachable too
- **WHEN** an investigator moves through the graph by keyboard
- **THEN** a selectable relation can be reached and selected without a pointer
