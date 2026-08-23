## ADDED Requirements

### Requirement: Running a transform attributes its steps
Steps staged by running a transform SHALL carry that transform's identity and the versioned source
they were acquired from, without the caller supplying it.

#### Scenario: Staged steps are attributed automatically
- **WHEN** a transform is run
- **THEN** every step it stages records that transform and the versioned source it used

#### Scenario: Attribution accompanies evidence attribution
- **WHEN** a staged step is inspected
- **THEN** it carries both the evidence it derives from and what produced it
