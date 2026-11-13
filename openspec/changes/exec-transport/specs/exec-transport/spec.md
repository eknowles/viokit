## Purpose

Lets a source be a command-line tool, so tools that exist only as programs can feed the engine through the same acquisition pipeline as web sources, with the runtime keeping control of how the command is run.

## ADDED Requirements

### Requirement: A command source runs without a shell
The system SHALL run an `exec` source as a command with an explicit argument list, and SHALL NOT pass it through a shell or build a command line by joining strings.

#### Scenario: Placeholders fill whole arguments
- **WHEN** a source declares the arguments `["+short", "{domain}", "A"]` and is bound with `domain` set to `example.com`
- **THEN** the command is run with exactly the three arguments `+short`, `example.com` and `A`

#### Scenario: Shell syntax in an input stays data
- **WHEN** an input value contains a space, a semicolon, a quote or a `$`
- **THEN** the command receives that value as one argument, unchanged, and nothing after it is run

### Requirement: Input is validated by its declared type
The system SHALL require each parameter of an `exec` source to declare a type, SHALL refuse a value that does not match that type, and SHALL refuse any value that begins with `-` or contains a NUL or a newline, failing before the command is started. Callers SHALL NOT be able to supply arguments that the source does not declare.

#### Scenario: A value that looks like an option
- **WHEN** an input value is `-f/etc/passwd`
- **THEN** binding fails with an error naming the parameter
- **AND** the command is not started

#### Scenario: A value of the wrong type
- **WHEN** a parameter declared as `domain` is given `not a domain`
- **THEN** binding fails with an error naming the parameter and the type
- **AND** the command is not started

#### Scenario: An unbound placeholder
- **WHEN** a source declares a placeholder and the input provides no value for it
- **THEN** binding fails with an error naming the missing parameter
- **AND** the command is not started

#### Scenario: A caller supplies an undeclared argument
- **WHEN** an input carries a parameter the source does not declare
- **THEN** the value is ignored and does not reach the command

### Requirement: A command runs inside resource limits
The system SHALL stop a command that runs longer than its declared timeout, SHALL stop a command whose standard output exceeds its declared size cap, and SHALL limit how many commands run at once in a deployment. Stopping a command SHALL end the command and every process it started.

#### Scenario: A command exceeds its timeout
- **WHEN** a command is still running when its timeout elapses
- **THEN** the command and all its child processes are terminated
- **AND** the acquisition fails with an error stating the timeout, and no evidence is recorded

#### Scenario: A child process outlives its parent's termination
- **WHEN** a command starts a child that ignores termination signals and the command times out
- **THEN** the acquisition still ends promptly and no child process remains

#### Scenario: A container command is stopped inside the container
- **WHEN** a command run through the container runner times out
- **THEN** the process inside the container is also ended within a bounded time after the timeout, and does not run on to completion

#### Scenario: Output exceeds the cap
- **WHEN** a command writes more standard output than its declared cap
- **THEN** reading stops, the command and its children are terminated, and the acquisition fails with an error stating the cap
- **AND** no partial output is recorded as evidence

#### Scenario: More commands than the concurrency limit
- **WHEN** more acquisitions are requested than the deployment's concurrency limit allows
- **THEN** the excess acquisitions wait for a free slot, and none exceeds the limit

### Requirement: A command runs through a host or container runner
The system SHALL run a command through a runner chosen by the deployment: either a local process, or a command executed inside a named running container, and SHALL give both the same argument, timeout and output handling.

#### Scenario: Container runner builds an argument-array command
- **WHEN** the deployment uses the container runner
- **THEN** the command is executed in the named container with its arguments as an array, an explicit working directory, and only the environment the source declares

#### Scenario: The container is not running
- **WHEN** the container runner is chosen and the named container is not running
- **THEN** the acquisition fails with an error naming the container
- **AND** no evidence is recorded

### Requirement: A command sees only what it is given
The system SHALL start a command with an environment limited to an allowlist and a working directory that holds no investigation data.

#### Scenario: Secrets in the parent environment
- **WHEN** the engine's own environment holds a credential that the source does not declare
- **THEN** the command's environment does not contain it

### Requirement: A non-zero exit is a failure
The system SHALL treat a command that exits with a non-zero status as a failed acquisition, with the status and a bounded excerpt of its error output in the error, and SHALL NOT record its output as evidence.

#### Scenario: The command fails
- **WHEN** a command exits with status 2
- **THEN** the acquisition fails with an error carrying that status
- **AND** no evidence is recorded

### Requirement: A successful run produces evidence from standard output
The system SHALL return a successful command's standard output as the acquisition's bytes, as plain text, through the same pipeline as every other transport.

#### Scenario: Successful acquisition
- **WHEN** a command exits with status 0 and writes standard output
- **THEN** the pipeline returns evidence whose bytes are that output and whose content type is plain text

### Requirement: Tools declare passive or active as metadata
The system SHALL require every `exec` source to declare whether its tool is passive or active, SHALL expose that declaration in the runtime catalog, and SHALL NOT refuse or alter an acquisition because of it.

#### Scenario: An active source runs
- **WHEN** acquisition is requested for an active source
- **THEN** the acquisition proceeds as for a passive source

#### Scenario: The catalog shows the kind
- **WHEN** the runtime catalog lists an exec source
- **THEN** its kind is shown

### Requirement: An exec source does not accept a proxy route
The system SHALL refuse an `exec` source whose egress policy is a proxy, with an error stating that the transport cannot honour the route, until a command's traffic can be routed by the runtime.

#### Scenario: A proxied exec source
- **WHEN** acquisition is requested for an `exec` source with a proxy egress policy
- **THEN** the acquisition fails with an error stating the route cannot be honoured
- **AND** the command is not started

### Requirement: A command's identity is part of what is cached
The system SHALL include a source's bound argument list in the request identity used by the cache, so that two inputs to the same command are never served from one another's cache entry.

#### Scenario: Two domains, one tool
- **WHEN** the same `exec` source is acquired for `a.example` and then for `b.example` with caching on
- **THEN** the second acquisition runs the command and does not return the first one's output
