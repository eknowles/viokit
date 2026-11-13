## Purpose

Carries one OpenSpec change from its task list to the integration branch with no human input, using an author agent, mechanical gates and an independent reviewer, so that delivery by parallel agents has a single safe path.

## ADDED Requirements

### Requirement: A change is claimed exclusively
The system SHALL let only one run work a given change at a time, and SHALL refuse to start a second run on a change that is already claimed.

#### Scenario: Two runs on one change
- **WHEN** a run is started for a change that another run has claimed
- **THEN** the second run stops before starting an author and reports who holds the claim

#### Scenario: A finished run releases its claim
- **WHEN** a run ends, whether it merged or failed
- **THEN** its claim is released

### Requirement: The author works in isolation under limits
The system SHALL run the author agent in its own git worktree on its own branch created from the integration branch, with a spend cap, a turn cap, and permissions limited to an explicit allow list, and SHALL NOT permit it to push or to change the main branch.

#### Scenario: The author's branch starts from integration
- **WHEN** a run starts
- **THEN** the author's branch is created from the current tip of the integration branch

#### Scenario: The author tries to push
- **WHEN** the author attempts a push or a checkout of the main branch
- **THEN** the action is denied and the run continues

#### Scenario: The spend cap is reached
- **WHEN** the author's estimated spend reaches the cap
- **THEN** the author stops and the run proceeds to the gates with whatever was committed

### Requirement: Mechanical gates decide, not the author
The system SHALL run the repository's check command, its tests, and the held-out guard against the author's branch, taking the guard from the integration branch's copy, and SHALL treat any failure as a failed run regardless of what the author reported.

#### Scenario: The author reports success but a test fails
- **WHEN** the author says it is done and a test fails
- **THEN** the gate fails and the run is not merged

#### Scenario: The author edits the guard
- **WHEN** the author's branch modifies the guard
- **THEN** the guard that runs is the integration branch's copy, and the change fails it

### Requirement: A failed gate returns to the author a bounded number of times
The system SHALL give the author the failing output and run it again, up to a fixed number of retries, then stop and leave the branch unmerged.

#### Scenario: A retry fixes the failure
- **WHEN** a gate fails and the author's next attempt passes every gate
- **THEN** the run continues to review

#### Scenario: Retries are exhausted
- **WHEN** the gates still fail after the last retry
- **THEN** the run ends as failed, nothing is merged, and the branch and the failure output are kept

### Requirement: An independent reviewer returns a verdict
The system SHALL run a reviewer as a separate process from the author, with read-only tools and a different model, and SHALL require a structured verdict stating approval and any findings.

#### Scenario: The reviewer finds a defect
- **WHEN** the reviewer returns a finding of high severity
- **THEN** the run does not merge

#### Scenario: The reviewer cannot edit
- **WHEN** the reviewer attempts to write or edit a file
- **THEN** the action is denied

#### Scenario: The reviewer returns something unusable
- **WHEN** the reviewer's output is not a valid verdict
- **THEN** the run does not merge

### Requirement: Merging goes only to integration
The system SHALL merge a passing branch into the integration branch only, and SHALL NOT change the main branch.

#### Scenario: A passing run
- **WHEN** every gate passes and the reviewer approves
- **THEN** the branch is merged into the integration branch and the main branch is unchanged

### Requirement: Every run leaves a record
The system SHALL write a record for each run stating the change, outcome, gate results, attempts, estimated spend, turns, and the reviewer's verdict.

#### Scenario: A failed run
- **WHEN** a run fails at a gate
- **THEN** its record names the gate and keeps the failing output

### Requirement: A dry run starts no agent
The system SHALL offer a mode that prints the commands it would run and starts no agent, creates no branch, and merges nothing.

#### Scenario: Dry run
- **WHEN** a run is started in dry-run mode
- **THEN** the commands are printed and the repository is unchanged
