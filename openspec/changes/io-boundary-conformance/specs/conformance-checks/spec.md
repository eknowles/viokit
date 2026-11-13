## Purpose

Holds the invariants against code written by agents with no human review, by checking them mechanically and keeping the checks out of the author's reach.

## ADDED Requirements

### Requirement: Outbound I/O is confined to the runtime
The system SHALL fail a check when code outside the source transports and the source runtime makes an outbound network call, starts a process, launches a browser, or imports a network or process module.

#### Scenario: A transform calls the network directly
- **WHEN** a pack or transform file calls `fetch` or `Bun.spawn`
- **THEN** the check fails and names the file, the line, and the invariant

#### Scenario: A module imports a process module
- **WHEN** a file outside the allowed paths imports `node:child_process` or `node:http`
- **THEN** the check fails and names the file and the import

#### Scenario: A member call named fetch is not a violation
- **WHEN** code calls a method named `fetch` on a transport object
- **THEN** the check does not flag it

#### Scenario: The runtime's own transports are allowed
- **WHEN** a file in the transports or the source runtime performs network or process I/O
- **THEN** the check does not flag it

### Requirement: A suppression comment cannot silence the check
The system SHALL fail when a source file carries a lint suppression comment that names the conformance plugin, because such a comment would otherwise turn the check off for the code beneath it.

#### Scenario: A line is suppressed
- **WHEN** a file has a suppression comment for the plugin category above a call to `fetch`
- **THEN** the check fails and names the file and line

#### Scenario: A whole file is suppressed
- **WHEN** a file opens with a file-level suppression for the plugin category
- **THEN** the check fails and names the file

#### Scenario: Unrelated suppressions are unaffected
- **WHEN** a file suppresses a different lint rule with a reason
- **THEN** the suppression check does not flag it

### Requirement: The check proves it can fail
The system SHALL include a fixture that violates the invariant and SHALL fail its own test run if the check does not flag that fixture.

#### Scenario: The check goes silent
- **WHEN** the rules are changed so the violating fixture is no longer flagged
- **THEN** the control test fails

### Requirement: A change cannot weaken the checks
The system SHALL fail a change whose diff against its base modifies or deletes the conformance rules, their configuration, the guard, an existing test file, or a main specification, and SHALL allow it to add new test files.

#### Scenario: An author edits a conformance rule
- **WHEN** a change modifies a file under the conformance directory
- **THEN** the guard fails and names the file

#### Scenario: An author loosens an existing test
- **WHEN** a change modifies or deletes a test file that existed on the base
- **THEN** the guard fails and names the file

#### Scenario: An author adds a fixture test for a new tool
- **WHEN** a change adds a new test file and modifies no protected file
- **THEN** the guard passes

#### Scenario: The guard runs from the base
- **WHEN** the guard is run by the orchestrator
- **THEN** it executes the base branch's copy of itself, so a change cannot alter the guard that judges it

### Requirement: The checks run with the existing pipeline
The system SHALL run the conformance check and the control test as part of the repository's standard check command, and SHALL NOT change runtime behaviour.

#### Scenario: The standard check command runs
- **WHEN** the repository's check command is run on a clean tree
- **THEN** the conformance check runs and passes
