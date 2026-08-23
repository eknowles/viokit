## ADDED Requirements

### Requirement: The operations are reachable over HTTP
The operations SHALL be exposed over a local HTTP surface, so a client that cannot speak the agent or
command protocols — a browser among them — can drive the engine through the same service as the other
front-ends, with no privileged path of its own (I8).

#### Scenario: An operation runs over HTTP
- **WHEN** a client invokes a known operation over HTTP with a valid payload
- **THEN** the operation runs and its result is returned to the client

#### Scenario: Every operation is reachable on every surface
- **WHEN** the operations exposed over HTTP are compared with those on the agent and command surfaces
- **THEN** the three sets are equal

#### Scenario: An unknown operation is refused
- **WHEN** a client invokes an operation name the deployment does not expose
- **THEN** the request is refused and no engine state changes

### Requirement: The HTTP surface is self-describing
The HTTP surface SHALL publish the operations it exposes, each with its arguments, their types, and
whether they are required, so a client can discover what it may call without out-of-band knowledge —
the same discovery principle the catalog applies to sources and transforms.

#### Scenario: A client discovers the surface
- **WHEN** a client requests the operation listing
- **THEN** it receives every exposed operation with its name, description, and argument declarations

#### Scenario: A discovered operation can be invoked from its declaration alone
- **WHEN** a client builds a payload from a discovered operation's argument declarations and invokes it
- **THEN** the payload is accepted

### Requirement: HTTP failures are distinguishable from successes
A request whose payload fails to decode, or whose operation fails, SHALL be answered with a failure a
client can distinguish from a success without inspecting the body, and SHALL leave engine state
unchanged (I6).

#### Scenario: A malformed payload is rejected
- **WHEN** a client invokes an operation with a payload that fails decoding
- **THEN** the response indicates failure and no engine state changes

#### Scenario: An operation failure is reported as a failure
- **WHEN** an operation invoked over HTTP fails
- **THEN** the response indicates failure rather than a success carrying an error
