## Purpose

Provides the container in which wrapped command-line tools run, so the exec transport has an isolated, reproducible place to execute them and the engine can reach it by name.

## ADDED Requirements

### Requirement: The image holds only the wrapped tools and runs unprivileged
The system SHALL define a container image containing the tools Viokit wraps and the utilities the exec runner depends on, SHALL run commands in it as a non-root user, and SHALL NOT mount any host directory into it.

#### Scenario: A wrapped tool is present
- **WHEN** the image is built and a wrapped tool is looked up inside a running container
- **THEN** the tool is found

#### Scenario: Commands do not run as root
- **WHEN** a command is run inside the container
- **THEN** it runs as the unprivileged tool user

#### Scenario: Host files and secrets are not visible
- **WHEN** a command inside the container lists host directories or reads its environment
- **THEN** no host project files and no engine secrets are visible

### Requirement: One named container is started with limits
The system SHALL start a single container with a fixed name, a memory limit and a process limit, SHALL start it only if it is not already running, and SHALL report its state.

#### Scenario: Start when stopped
- **WHEN** the start command is run and no such container is running
- **THEN** a container with the fixed name is running with its limits applied

#### Scenario: Start when already running
- **WHEN** the start command is run and the container is already running
- **THEN** no second container is created and the command reports that it is already running

#### Scenario: Status reports the state
- **WHEN** the status command is run
- **THEN** it reports whether the container is running, stopped, or absent

### Requirement: Raw sockets are granted only on request
The system SHALL start the container with every capability dropped by default, and SHALL grant raw sockets only when the start command is given an explicit flag, in which case the container runs as root with only that capability.

#### Scenario: A SYN scan by default
- **WHEN** a tool that needs a raw socket runs in a container started without the flag
- **THEN** the tool reports it cannot open a raw socket

#### Scenario: A SYN scan with the flag
- **WHEN** the container is started with the flag and a tool that needs a raw socket runs in it
- **THEN** the tool opens its raw socket and completes
- **AND** the commands in that container run as root

#### Scenario: A connect scan by default
- **WHEN** a tool runs a connect-based scan in a container started without the flag
- **THEN** it completes

### Requirement: The engine reaches the container by name
The system SHALL print the setting that points the engine's exec runner at the container, and SHALL NOT require any other engine change.

#### Scenario: Printing the setting
- **WHEN** the env command is run
- **THEN** it prints the container-name setting the engine already reads
