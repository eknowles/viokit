## ADDED Requirements

### Requirement: A source may declare a browser transport
A source specification SHALL be able to declare that it is reached by driving a browser, distinct
from an HTTP request or a dataset read, so sources that only exist behind a rendered page are
describable.

#### Scenario: A browser source is specified
- **WHEN** a source declaring the browser transport is decoded
- **THEN** it is accepted and its transport is browser

#### Scenario: Existing transports are unaffected
- **WHEN** a source declaring an existing transport is decoded
- **THEN** it behaves exactly as before
