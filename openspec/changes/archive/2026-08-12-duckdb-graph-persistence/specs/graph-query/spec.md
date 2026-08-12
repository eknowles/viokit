## MODIFIED Requirements

### Requirement: Distance-ranked relatedness
The engine SHALL return entities reachable from a seed entity within a depth bound, ranked by distance from the seed (nearest first). When the retained store is backed by a persisted DuckDB path, this SHALL operate against the rebuilt projection, so relatedness reflects the durable graph after reopen.

#### Scenario: Relatedness ranks by distance
- **WHEN** a relatedness query is run from a seed with a depth bound
- **THEN** the engine returns reachable entities ranked by increasing distance from the seed

#### Scenario: Relatedness reflects persisted state after reopen
- **WHEN** a persisted store is reopened on its path after prior writes
- **THEN** a relatedness query returns the same distance-ranked results as before the restart