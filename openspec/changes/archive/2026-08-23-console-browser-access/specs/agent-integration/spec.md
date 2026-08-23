## ADDED Requirements

### Requirement: The HTTP surface is reachable from a browser
The HTTP surface SHALL be usable by a browser client served from a different origin on the local
machine, answering the preflight request a cross-origin JSON request requires and marking its
responses — including failures — as readable by that origin.

#### Scenario: A preflight is answered
- **WHEN** a browser asks whether it may send a cross-origin JSON request from a local origin
- **THEN** the surface answers affirmatively, naming the methods and headers it accepts

#### Scenario: Failures remain readable
- **WHEN** an operation invoked from a local browser origin fails
- **THEN** the response is marked readable by that origin, so the caller sees the engine's error
  rather than a network failure

### Requirement: Cross-origin access is limited to the local machine
The surface SHALL grant cross-origin access only to origins on the local machine, and SHALL NOT grant
it to any origin. Until access control exists, an unauthenticated surface reachable from any page
would let any site drive an investigation.

#### Scenario: A local origin is granted access
- **WHEN** a request arrives from a loopback origin
- **THEN** it is granted cross-origin access

#### Scenario: A remote origin is not
- **WHEN** a request arrives from an origin that is not on the local machine
- **THEN** it is not granted cross-origin access

#### Scenario: Requests without an origin are unaffected
- **WHEN** a request arrives with no origin, as from a command-line client
- **THEN** it is served as before
