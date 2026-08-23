## ADDED Requirements

### Requirement: A classification is refused where the probed url cannot support one
Where a source's url addresses a site rather than something within it, and the response is a web
page, the system SHALL report the classification as unknown with the reason, rather than classifying
the site from its front door.

#### Scenario: A page served from a front door is not classified
- **WHEN** a source whose url is a bare host is probed and serves a web page
- **THEN** the observation reports the classification as unknown
- **AND** names pointing the spec at an endpoint as what would resolve it

#### Scenario: A page served from within a site is classified
- **WHEN** a source whose url addresses a path is probed and serves a web page
- **THEN** the observation classifies it

#### Scenario: A machine-readable response from a front door is still classified
- **WHEN** a source whose url is a bare host is probed and serves parseable machine-readable data
- **THEN** the observation reports it as an open API

### Requirement: A forbidden response does not establish a credential requirement
The system SHALL treat a response that refuses the request without demanding authentication as
inconclusive, since a credential wall and a blocked client produce it alike.

#### Scenario: A forbidden response is inconclusive
- **WHEN** a probed source answers 403
- **THEN** the observation reports the classification as unknown, naming both possibilities

#### Scenario: A response demanding authentication is conclusive
- **WHEN** a probed source answers 401
- **THEN** the observation reports it as requiring a key

### Requirement: An inconclusive render says why
Where a browser was available and the page could still not be rendered, the observation SHALL carry
the reason rather than reporting only that it could not tell.

#### Scenario: A failed render is explained
- **WHEN** a page is probed, a browser is available, and rendering fails
- **THEN** the observation carries why it failed
- **AND** does not report that no browser was available
