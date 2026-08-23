## ADDED Requirements

### Requirement: Source credentials are referenced, never carried
A source specification SHALL declare the credential it needs as a *reference* to a secret held
outside the specification, together with how the credential is to be applied to a request. A
specification SHALL NOT be able to carry a credential value itself, so that a credential cannot be
written into a pack or committed to version control.

#### Scenario: A credential-gated source names its secret
- **WHEN** a source that requires a credential is specified
- **THEN** it records the name of the secret to resolve and how to apply it, and no credential value

#### Scenario: A specification carrying a literal credential is rejected
- **WHEN** a source specification is decoded that carries a credential value rather than a reference
- **THEN** decoding fails (I6)
