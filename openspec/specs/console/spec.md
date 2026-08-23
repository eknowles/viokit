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

### Requirement: The console holds no privileged path and no persisted view state
The console SHALL reach the engine only through the shared operation surface, decoding every response
against the shared schema (I6, I8). It SHALL NOT persist view state, because persisted view state must
be schema-encoded, versioned, and server-backed (I12), which this change does not provide.

#### Scenario: Every action goes through the shared surface
- **WHEN** the console performs any action against the engine
- **THEN** it does so through an operation the other front-ends also expose

#### Scenario: View state does not survive a reload
- **WHEN** the investigator reloads the console
- **THEN** it returns to its initial view, having persisted nothing
