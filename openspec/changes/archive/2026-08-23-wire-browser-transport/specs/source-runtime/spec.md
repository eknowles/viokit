## ADDED Requirements

### Requirement: A deployment declares the transports it provides
The transports a deployment can actually perform SHALL be declared by that deployment, and
runnability SHALL be derived from that declaration, so a source is reported runnable only where the
means to acquire it is present.

#### Scenario: A declared transport makes its sources runnable
- **WHEN** a deployment declares a transport and a source requires it
- **THEN** that source is reported runnable

#### Scenario: An undeclared transport leaves its sources blocked
- **WHEN** a deployment does not declare a transport that a source requires
- **THEN** that source is reported not runnable, with the missing transport as the reason
- **AND** acquiring it fails without attempting a request
