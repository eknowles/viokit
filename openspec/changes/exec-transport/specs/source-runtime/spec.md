## ADDED Requirements

### Requirement: An exec source fails before running when its command is missing
The runtime SHALL fail an acquisition for an `exec` source with an error naming the command when the command cannot be found by the chosen runner, SHALL report the source as not runnable when the deployment does not declare the `exec` transport, and SHALL start no process in either case.

#### Scenario: The command is not installed
- **WHEN** acquisition is requested for an `exec` source whose command cannot be found
- **THEN** the runtime fails with an error naming the command
- **AND** no process for the command is started

#### Scenario: The deployment does not provide the transport
- **WHEN** a deployment does not declare `exec` and a source requires it
- **THEN** that source is reported not runnable, with the missing transport as the reason
