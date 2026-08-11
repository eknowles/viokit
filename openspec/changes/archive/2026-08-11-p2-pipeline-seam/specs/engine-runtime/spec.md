## ADDED Requirements

### Requirement: Engine runs a transform into attributed steps
The engine SHALL run a transform through its source runtime, persist the resulting evidence, project it into graph operations, and wrap each operation in a `Step` attributed to that evidence. It SHALL return the resulting steps as staged output and SHALL NOT require the caller to stage them separately from the graph commit.

#### Scenario: A transform produces attributed steps
- **WHEN** the engine runs a transform against a source through the `Engine` seam
- **THEN** each resulting `Step` references at least one evidence id from the run and the steps are returned ready to commit

### Requirement: Engine commits staged transforms to a graph store
The engine SHALL commit a transform's staged steps to its graph store, rejecting any step that does not reference at least one evidence id.

#### Scenario: Staged transform steps are committed
- **WHEN** the engine commits the staged output of a transform run
- **THEN** each step is appended to the step log and its vertices/edges become part of the foldable graph state

### Requirement: Engine correlates staged entities into merges
The engine SHALL, given staged steps, its current graph state, and per-kind match rules, promote any staged entity sharing a normalized identifier with an existing vertex into an append-only `ResolveEntity` merge step. It SHALL NOT rewrite existing history.

#### Scenario: A normalized-identifier collision is merged
- **WHEN** a staged entity's identifier normalizes identically to an existing vertex's identifier and a matching rule is supplied
- **THEN** the engine returns a `ResolveEntity` step attributing the staged entity as the merge and the existing vertex as canonical

### Requirement: Engine exposes the four graph query surfaces
The engine SHALL expose shortest-path (`paths`), temporal (`timeline`), spatial (`spatial`), and relatedness (`relatedness`) queries over the graph through its seam, returning domain-neutral depth-bounded paths, extent hits, and distance-ranked related entities.

#### Scenario: The engine answers a relatedness query
- **WHEN** a relatedness query is run from a seed entity through the `Engine` seam
- **THEN** the engine returns entities reachable from the seed, ranked by distance

### Requirement: Engine defaults to the retained graph store
The engine SHALL wire its default layer over the retained graph store (DuckDB replay projection), with an in-memory fallback available, so that a pipeline run exercises replay/projection rather than a throwaway store.

#### Scenario: The default engine layer replays over the retained store
- **WHEN** the default `Engine` layer is used without overriding the graph store
- **THEN** graph insert, log, and replay operate over the retained store's step log and projection