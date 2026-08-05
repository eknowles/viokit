# Egress

## Purpose

Defines the runtime-owned egress/proxy stage that governs how the runtime reaches the outside world, binds it to identities, and records the actual path taken.

## Requirements

### Requirement: Egress is a runtime-owned stage
The system SHALL route acquisition network traffic through a runtime-owned egress stage selected per source from `direct`, `proxy`, and `disabled` policies.

#### Scenario: Direct egress
- **WHEN** a source uses the `direct` egress policy
- **THEN** the runtime reaches the source directly over the network

#### Scenario: Proxied egress
- **WHEN** a source uses the `proxy` egress policy with an assigned proxy
- **THEN** the runtime routes traffic through that proxy

#### Scenario: Disabled egress
- **WHEN** a source uses the `disabled` egress policy
- **THEN** the runtime performs no network egress for that source

### Requirement: Identity is bound to an egress path
The system SHALL bind a source's identity (credential) to an egress path so that proxy and direct routing are consistent with the identity used.

#### Scenario: Identity uses its bound egress
- **WHEN** an identity is bound to a specific egress path
- **THEN** acquisitions under that identity always use that path

### Requirement: Every egress hop is recorded
The system SHALL record in the step log which path a hop took, including a `viaProxy` marker when it went through a proxy.

#### Scenario: Recording a proxied hop
- **WHEN** an acquisition hops through a proxy
- **THEN** the step log records `viaProxy` for that proxy and the acquisition's path is `proxy`

#### Scenario: Recording a direct hop
- **WHEN** an acquisition hops directly
- **THEN** the step log records the hop as direct and the acquisition's path is `live`

### Requirement: Cache-only acquisitions perform no egress
The system SHALL refuse egress for `cache-only` acquisitions so that offline runs cannot touch the network.

#### Scenario: Cache-only never egresses
- **WHEN** an acquisition is `cache-only`
- **THEN** the egress stage is not invoked for it
