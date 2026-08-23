## ADDED Requirements

### Requirement: Acquisition is refused for sources this deployment cannot run
The runtime SHALL determine whether a source can be acquired in this deployment from its access
classification, the transports the deployment provides, and whether required credentials are
configured. When it cannot, the runtime SHALL fail with an error naming the reason, before attempting
any transport, so a caller learns that the source needs a browser or a key rather than receiving a
transport failure.

#### Scenario: A browser-only source is refused with its reason
- **WHEN** acquisition is requested for a source classified as browser-only and the deployment
  provides no browser transport
- **THEN** the runtime fails with an error stating that the source requires a browser transport
- **AND** no network request is attempted

#### Scenario: A credential-gated source without credentials is refused
- **WHEN** acquisition is requested for a source that requires credentials and none are configured
  on the specification
- **THEN** the runtime fails with an error stating that credentials are not configured

#### Scenario: A credential-gated source with credentials proceeds
- **WHEN** acquisition is requested for a source that requires credentials and its specification
  carries them
- **THEN** the runtime proceeds with acquisition as normal

#### Scenario: A runnable source is unaffected
- **WHEN** acquisition is requested for a source reachable over a transport the deployment provides
- **THEN** the runtime acquires it as before
