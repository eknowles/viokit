# Ontology Registry

## Purpose

Provides a runtime registry where ontology types (Entity, Relation, Event definitions) can be registered and validated, keeping the engine core primitives-only and enforcing the open-domain rule.

## Requirements

### Requirement: Types are registered at runtime
The registry SHALL accept registration of a named ontology type definition and SHALL make registered types available for later lookup by name.

#### Scenario: Registering a type
- **WHEN** a type definition is registered under a unique name
- **THEN** the registry returns success and the type is retrievable by that name

### Requirement: Duplicate registration is rejected
The registry SHALL reject registering a second definition under a name that is already registered.

#### Scenario: Registering a duplicate name
- **WHEN** a name is registered for a second time
- **THEN** the registry reports a duplicate-registration error and keeps the original definition

### Requirement: Registered types are validated against the primitive schema
The registry SHALL validate a registered type's fields against the core primitive schema (Entity/Relation/Event) and SHALL reject definitions that do not conform.

#### Scenario: Registering an invalid definition
- **WHEN** a type definition does not conform to the primitive schema
- **THEN** the registry rejects registration and reports the validation failure

### Requirement: Core remains primitives-only
The registry SHALL only operate on core primitive types; domain-specific type definitions SHALL NOT be added to the engine core and MUST instead be provided by domain packs.

#### Scenario: No domain types in core
- **WHEN** the core is inspected
- **THEN** it contains no domain entity/relation/event type definitions beyond the primitive suite

### Requirement: Unknown type lookup reports absent
Looking up a type by a name that was never registered SHALL yield an explicit "not found" outcome.

#### Scenario: Looking up an unknown type
- **WHEN** a lookup is issued for a name with no registered type
- **THEN** the registry reports the name as not found
