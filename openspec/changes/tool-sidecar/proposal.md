## Why

The exec transport can run a command inside a named container, and the project decided tools run in a Kali container (decision 5). There is no such container: nothing builds the image, starts it, or tells the engine where it is. Without it, the container runner can only be tested against whatever container a developer happens to have.

## What Changes

- Add a slim Kali image definition that holds only the tools Viokit wraps (`dig`, `whois`, `nmap`, plus `timeout` and `pgrep`, which the runner and its tests need), running as an unprivileged user with no mounts.
- Add a small script with `build`, `up`, `down`, `status` and `env` commands that manages one named container with memory and process limits.
- The container is reached by name through the existing `VIOKIT_EXEC_CONTAINER` setting. `env` prints it; nothing else about the engine changes.
- Raw-socket scans are off by default. An explicit `--net-raw` flag on `up` grants the capability.
- Add an opt-in end-to-end test that runs `dig` through the container runner against the real sidecar.

Out of scope: wrapping further tools (each is its own small change), a supervisor or restart policy beyond Docker's, publishing the image to a registry, Windows or Podman specifics, and any change to the exec transport.

## Capabilities

### New Capabilities
- `tool-sidecar`: building, running and reaching the container that holds the wrapped tools.

### Modified Capabilities

## Impact

- `sidecar/Dockerfile`: new. `scripts/sidecar.ts` and its test: new. `package.json`: a `sidecar` script.
- Requires Docker on the machine that runs the sidecar. No change to runtime packages and no new package dependency.
