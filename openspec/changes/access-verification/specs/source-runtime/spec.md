## ADDED Requirements

### Requirement: A transport reports what the source served
A transport SHALL report the content type the source served and, where its protocol has one, the
status it returned, so the record of an acquisition describes what was actually acquired.

#### Scenario: An artifact records the type it was served as
- **WHEN** a source returns a response declaring a content type
- **THEN** the stored evidence records that content type

#### Scenario: A response declaring no type is recorded as unspecified
- **WHEN** a source returns a response declaring no content type
- **THEN** the stored evidence records an unspecified binary type

#### Scenario: A rejected request is distinguishable from a served one
- **WHEN** a source rejects a request for want of a credential
- **THEN** the acquisition's status is visible to the runtime rather than resembling a successful fetch

### Requirement: A source's access classification can be verified against what it serves
The system SHALL be able to acquire a registered source and derive, from what it served, which access
classification it actually has, reporting that alongside the classification the source declares.

#### Scenario: An endpoint serving machine-readable data verifies as an API
- **WHEN** a source is probed and serves a parseable machine-readable body
- **THEN** the observation reports it as an open API

#### Scenario: An endpoint demanding a credential verifies as key-gated
- **WHEN** a source is probed and rejects the request for want of a credential
- **THEN** the observation reports it as requiring a key
- **AND** does so even where the rejection was served as a web page

#### Scenario: A page whose content needs a browser is distinguished from one that does not
- **WHEN** a source serving a web page is probed and this deployment provides a browser
- **THEN** the observation reports whether the page's content depends on being rendered

#### Scenario: A disagreement with the declared classification is reported, not applied
- **WHEN** a probe observes a classification differing from the one the source declares
- **THEN** the observation reports both and that they disagree
- **AND** the source's own classification is left unchanged

#### Scenario: An inconclusive probe says so
- **WHEN** a probe cannot determine a classification from what the source served
- **THEN** the observation reports the classification as unknown, with the reason

### Requirement: A verified classification names the evidence behind it
An access observation SHALL carry the identity of the artifacts it was derived from, so the
classification can be re-derived or disputed rather than trusted.

#### Scenario: The observation's evidence is retrievable
- **WHEN** a probe produces an observation
- **THEN** the artifacts it names are readable from the evidence store

### Requirement: Probing does not bypass acquisition policy
A probe SHALL acquire through the source runtime, so cache mode, egress route, rate limit, and
credential resolution apply to it as to any other acquisition (I4/I10).

#### Scenario: A probe is subject to egress policy
- **WHEN** a source whose egress policy is disabled is probed
- **THEN** the probe fails on that policy rather than reaching the network
