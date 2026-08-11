# Graph Query

## Purpose

Defines the engine's graph query surfaces — shortest paths, temporal and spatial window scans, and distance-ranked relatedness — which let investigations interrogate the folded graph over a shared, domain-neutral contract.

## Requirements

### Requirement: Shortest paths between entities
The engine SHALL return depth-bounded shortest paths between two entities, traversing relation edges, and return them as ordered vertex sequences. It SHALL return an empty result when the entities are unreachable within the depth bound.

#### Scenario: A path exists within the depth bound
- **WHEN** two connected entities are queried for a path within a depth bound
- **THEN** the engine returns the relation edges forming a shortest path between them

#### Scenario: No path within the depth bound
- **WHEN** two entities are queried but no connecting path exists within the depth bound
- **THEN** the engine returns an empty path set

### Requirement: Temporal window scan
The engine SHALL return entities and events whose temporal extent overlaps a given time window, as extent hits carrying the entity/event and the overlapping extent.

#### Scenario: An entity falls inside the window
- **WHEN** a timeline query is run for a window covered by an entity's temporal extent
- **THEN** the engine returns that entity as an extent hit

### Requirement: Spatial bbox scan
The engine SHALL return entities and events whose spatial extent falls inside a WGS84 bounding box.

#### Scenario: An entity falls inside the bbox
- **WHEN** a spatial query is run for a box enclosing an entity's spatial extent
- **THEN** the engine returns that entity as an extent hit

### Requirement: Distance-ranked relatedness
The engine SHALL return entities reachable from a seed entity within a depth bound, ranked by distance from the seed (nearest first).

#### Scenario: Relatedness ranks by distance
- **WHEN** a relatedness query is run from a seed with a depth bound
- **THEN** the engine returns reachable entities ranked by increasing distance from the seed