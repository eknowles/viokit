## MODIFIED Requirements

### Requirement: The console holds no privileged path and persists view state server-side
The console SHALL reach the engine only through the shared operation surface, decoding every response
against the shared schema (I6, I8). It SHALL persist its view state through that surface rather than
in the browser, so the state is server-backed, schema-encoded, and versioned as I12 requires.

#### Scenario: Every action goes through the shared surface
- **WHEN** the console performs any action against the engine
- **THEN** it does so through an operation the other front-ends also expose

#### Scenario: View state survives a reload
- **WHEN** the investigator changes view, selects a transform, then reloads the console
- **THEN** it returns to the view and selection it had

#### Scenario: Unusable stored state does not break the console
- **WHEN** stored view state cannot be loaded or understood
- **THEN** the console starts from its defaults and remains usable
