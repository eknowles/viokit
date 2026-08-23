## ADDED Requirements

### Requirement: Engine reports the deployment's catalog
The engine SHALL expose the catalog of the running deployment — its registered sources, transforms, and ontology types — and SHALL describe any catalog entry's invocation contract, so every front-end discovers capability from one place rather than from its own registry.

#### Scenario: The engine lists registered capability
- **WHEN** the catalog is requested from an engine with registered packs
- **THEN** the engine returns the registered sources, transforms, and ontology types

#### Scenario: The engine describes an entry
- **WHEN** a registered entry is described through the engine
- **THEN** the engine returns that entry's invocation contract

#### Scenario: Catalog reporting does not alter engine state
- **WHEN** the catalog is listed or an entry described
- **THEN** no step is appended and no evidence is written (I3)
