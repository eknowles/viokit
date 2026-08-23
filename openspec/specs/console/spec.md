# Console

## Purpose

Gives an investigator a browser interface for driving the engine — discovering what a deployment can do, running transforms, submitting evidence, and querying the graph — built entirely from what the deployment describes about itself rather than from hardcoded knowledge of any domain.

## Requirements

### Requirement: The console is built from the deployment's own description
The console SHALL derive what it offers from the catalog and the operation surface at runtime, rather
than from hardcoded knowledge of particular sources, transforms, or entity types. Registering a pack
SHALL therefore change what the console offers with no change to the console.

#### Scenario: A newly registered pack appears without a console change
- **WHEN** a deployment registers a pack the console has never seen
- **THEN** that pack's sources and transforms appear in the console

#### Scenario: An empty deployment is usable
- **WHEN** the console connects to a deployment with no packs registered
- **THEN** it reports that nothing is registered rather than failing

### Requirement: The console shows what can actually be run
The console SHALL show, for each source, whether this deployment can acquire it, and the reason when
it cannot, so an investigator can tell a source that is missing from one that needs a browser or a
credential.

#### Scenario: An unusable source is distinguishable at a glance
- **WHEN** the catalog view lists a source this deployment cannot acquire
- **THEN** it is marked as such and its reason is available

#### Scenario: The listing can be narrowed to usable sources
- **WHEN** the investigator asks for only what can be run here
- **THEN** only acquirable sources are shown

### Requirement: Transform inputs are generated from published contracts
The console SHALL generate a transform's input form from the contract the catalog publishes for it,
so a transform becomes runnable in the console as soon as it is registered. Where a published contract
is not renderable as fields, the console SHALL still allow the transform to be run by accepting the
input directly, rather than blocking it.

#### Scenario: A registered transform is runnable without console changes
- **WHEN** an investigator opens a transform the console has no specific knowledge of
- **THEN** a form matching its published contract is offered

#### Scenario: Required and optional inputs are distinguished
- **WHEN** a contract marks some inputs required and others optional
- **THEN** the form reflects that distinction

#### Scenario: An unrenderable contract degrades rather than blocks
- **WHEN** a contract cannot be rendered as fields
- **THEN** the console offers direct input entry so the transform can still be run

### Requirement: Running a transform stages before it commits
Running a transform from the console SHALL produce staged steps that are shown to the investigator
with their evidence attribution, and committing them to the graph SHALL be a separate, explicit
action.

#### Scenario: Staged steps are reviewable before they land
- **WHEN** a transform is run from the console
- **THEN** its staged steps are shown with the evidence each is attributed to, and the graph is unchanged

#### Scenario: Committing is explicit
- **WHEN** the investigator commits the staged steps
- **THEN** they are appended to the graph and become visible to queries

### Requirement: Evidence can be submitted from the console
The console SHALL let an investigator submit an artifact they retrieved themselves, recorded as
manually acquired with its retriever and origin, so a source the engine cannot fetch can still be
worked.

#### Scenario: A manually retrieved artifact becomes evidence
- **WHEN** an investigator submits a retrieved artifact with their name and its origin
- **THEN** it is stored as evidence and its identifier is shown for attribution

#### Scenario: An incomplete submission is refused with its reason
- **WHEN** a submission omits what the engine requires
- **THEN** the console shows the engine's rejection rather than appearing to succeed

### Requirement: The console queries the graph over the shared surfaces
The console SHALL offer entity lookup and the engine's graph query surfaces, presenting their results
without interpreting them in domain terms.

#### Scenario: An investigator queries the graph
- **WHEN** a graph query is run from the console
- **THEN** its results are shown as returned by the engine

#### Scenario: An empty result is reported as empty
- **WHEN** a query matches nothing
- **THEN** the console reports no results rather than an error

### Requirement: The console holds no privileged path and persists view state server-side
The console SHALL reach the engine only through the shared operation surface, decoding every response
against the shared schema (I6, I8). It SHALL persist its view state through that surface rather than
in the browser, so the state is server-backed, schema-encoded, and versioned as I12 requires.

#### Scenario: Every action goes through the shared surface
- **WHEN** the console performs any action against the engine
- **THEN** it does so through an operation the other front-ends also expose

#### Scenario: View state survives a reload
- **WHEN** the investigator changes view, selects a transform, then reloads the console
- **THEN** it returns to the view and selection it had

#### Scenario: Unusable stored state does not break the console
- **WHEN** stored view state cannot be loaded or understood
- **THEN** the console starts from its defaults and remains usable

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

### Requirement: Provenance names what produced a claim
Where a step records what produced it, the console SHALL show that alongside the evidence — the
transform that ran and the versioned source it acquired from — so an investigator can see not only
what a claim rests on but what derived it.

#### Scenario: A derived step names its transform and source
- **WHEN** provenance is shown for a step produced by a transform
- **THEN** the transform and the versioned source are shown

#### Scenario: A step without attribution does not invent one
- **WHEN** provenance is shown for a step that records no source
- **THEN** no transform or source is claimed for it

### Requirement: Relations and events are selectable
The console SHALL let an investigator select a relation or an event in the graph, not only an entity,
so every kind of assertion the graph holds can be inspected.

#### Scenario: A relation can be selected
- **WHEN** an investigator selects a relation in the graph
- **THEN** what it asserts, the entities it connects, and its period are shown

#### Scenario: An event appears and can be selected
- **WHEN** the graph contains an event
- **THEN** it is drawn, distinguished from an entity, connected to the entities it involves, and can be selected

#### Scenario: One subject is selected at a time
- **WHEN** an investigator selects a second subject
- **THEN** the first is no longer selected

### Requirement: Provenance is shown for whichever subject is selected
The steps and evidence behind a selection SHALL be shown for a relation or an event exactly as for an
entity, and SHALL be the steps that asserted *that* subject rather than steps merely mentioning
something near it.

#### Scenario: A relation's provenance is its own
- **WHEN** an investigator selects a relation
- **THEN** the steps shown are those that asserted that relation

#### Scenario: A subject with no recorded steps says so
- **WHEN** a selected relation or event has no step naming it
- **THEN** the panel reports that rather than appearing to show a complete trail
