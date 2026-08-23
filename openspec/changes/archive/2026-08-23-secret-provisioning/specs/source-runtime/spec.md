## ADDED Requirements

### Requirement: The runtime resolves credentials and applies them
Where a source declares a credential reference, the runtime SHALL resolve it at acquisition time and
apply the credential to the outbound request according to the declared scheme, so that callers and
transforms never hold a credential (I4/I10).

#### Scenario: A resolved credential reaches the request
- **WHEN** a source declaring a credential reference is acquired and the secret resolves
- **THEN** the outbound request carries the credential as the declared scheme specifies

#### Scenario: Callers never receive the credential
- **WHEN** a caller acquires a credential-gated source
- **THEN** nothing the caller receives contains the credential value

### Requirement: An unresolvable credential makes a source unrunnable
A source whose credential reference does not resolve in this deployment SHALL be reported as not
runnable, and acquiring it SHALL fail with that reason before any request is attempted.

#### Scenario: A missing secret is reported, not attempted
- **WHEN** acquisition is requested for a source whose credential reference does not resolve
- **THEN** it fails with a reason naming the missing reference
- **AND** no request is attempted

#### Scenario: Providing the secret makes the source runnable
- **WHEN** the referenced secret becomes resolvable
- **THEN** the source reports as runnable and can be acquired

### Requirement: Credentials stay out of the trail
A credential SHALL NOT appear in the request fingerprint used for caching, in any stored evidence, in
the step log, or in an error message. A failure concerning a credential SHALL name the reference
rather than the value.

#### Scenario: Cache identity ignores the credential
- **WHEN** two acquisitions of one source differ only by the credential resolved
- **THEN** they share a cache fingerprint

#### Scenario: A credential failure names the reference
- **WHEN** a credential cannot be resolved
- **THEN** the reported failure names the reference and contains no credential value
