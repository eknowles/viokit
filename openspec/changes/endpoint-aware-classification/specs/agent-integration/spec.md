## ADDED Requirements

### Requirement: The catalog reports which sources are not wired up
A source entry SHALL report whether its url addresses a site's front door rather than something
within it, so sources that are registered but not yet pointed at an endpoint are enumerable.

#### Scenario: A front-door spec is reported as one
- **WHEN** the catalog lists a source whose url is a bare host
- **THEN** the entry reports it as a front door

#### Scenario: A spec addressing an endpoint is not
- **WHEN** the catalog lists a source whose url addresses a path
- **THEN** the entry does not report it as a front door
