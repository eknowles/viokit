## ADDED Requirements

### Requirement: Transports are told the egress decision
The runtime SHALL pass a transport the egress decision it resolved, alongside any credential, so a
transport can route its traffic as policy requires. A transport SHALL NOT choose its own route
(I4/I10).

#### Scenario: The resolved route reaches the transport
- **WHEN** the runtime acquires a source whose policy resolves to a proxied route
- **THEN** the transport is told that route before it fetches

#### Scenario: A direct route is equally explicit
- **WHEN** the runtime acquires a source whose policy resolves to a direct route
- **THEN** the transport is told that route

### Requirement: An acquisition that cannot honour its egress policy fails
Where a transport cannot bind its traffic to the route the runtime resolved, the acquisition SHALL
fail with that reason rather than proceeding by another route. Silently fetching direct when policy
required a proxy is forbidden (I10).

#### Scenario: An unbindable browser acquisition is refused
- **WHEN** a browser acquisition is required to use a proxy but the configured browser engine cannot
  be bound to one
- **THEN** the acquisition fails, naming the reason
- **AND** no request is made by any other route

#### Scenario: A bindable acquisition proceeds
- **WHEN** a browser acquisition is required to use a proxy and the browser engine can be bound to it
- **THEN** the acquisition proceeds over that proxy

### Requirement: Browser identities do not share sessions
Where acquisitions run under different identities, their browser sessions SHALL be isolated, so
cookies and stored credentials from one identity are never presented under another (TDR-011).

#### Scenario: Two identities do not share cookies
- **WHEN** two acquisitions run under different identities
- **THEN** neither session can read the other's cookies or storage

#### Scenario: One identity keeps its session across acquisitions
- **WHEN** two acquisitions run under the same identity
- **THEN** they share a session, so a login obtained once is still present
