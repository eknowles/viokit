## Purpose

Allows the graph store to be backed by a named, durable DuckDB database so that the append-only step log and its folded graph state survive process restarts and reproduce identically on reopen.

## ADDED Requirements

### Requirement: Persisted graph store path
The graph store SHALL be openable against a named DuckDB database path supplied by the caller, and SHALL default to an anonymous in-memory database when no path is provided.

#### Scenario: Opening with a path yields a durable store
- **WHEN** a caller opens a graph store with a database path
- **THEN** the store persists its step log and projection to that path
- **AND** reopening the same path yields a store that retains the prior write

#### Scenario: Opening without a path yields an in-memory store
- **WHEN** a caller opens a graph store without a database path
- **THEN** the store behaves as in-memory and does not require or create a file

### Requirement: Step log survives restart
The graph store SHALL treat its append-only step log as the durable system of record across store instances on the same path.

#### Scenario: Prior steps are present after reopen
- **WHEN** a persisted store writes steps, is closed, and is reopened on the same path
- **THEN** the reopened store's log contains the prior steps in order (I3/I11)

### Requirement: Projection reproduced on reopen
The graph store SHALL rebuild its materialized entity/relation/event projection from the persisted step log on open, so queries reflect the prior folded state without re-running the writes.

#### Scenario: Replay reproduces state after restart
- **WHEN** a persisted store is reopened after prior writes
- **THEN** its replay (and query surfaces) return the same entities, relations, and events as before the restart (I3/I11)