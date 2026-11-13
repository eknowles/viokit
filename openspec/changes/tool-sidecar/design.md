## Context

The exec transport's container runner builds `docker exec ... <container> timeout -s KILL <n> <command> <args>` and the agent deployment already chooses the container runner when `VIOKIT_EXEC_CONTAINER` names a container. What is missing is the container itself. See `proposal.md`.

## Goals / Non-Goals

**Goals:** a small, reproducible image; one command to build and one to start; isolation from the engine's files and secrets; a clear default on raw sockets.

**Non-Goals:** more tools, a registry, orchestration, resource tuning per tool.

## Spike

Run 2026-11-13 on Docker 27.3.1, Linux. Pulling and building needed network access.

| Question | Result |
|---|---|
| Can the Kali base be pulled here? | **Yes.** `kalilinux/kali-rolling:latest`, 122 MB. |
| How big is a slim image with the wrapped tools? | **174 MB** (`dnsutils`, `nmap`, `whois`, `procps`, `ca-certificates`), built in 18 s. The full headless set is several GB, so it is not used. |
| Are the runner's dependencies present? | **Yes.** `timeout` (coreutils) and `pgrep` (procps) are at `/usr/bin`. |
| Does it run unprivileged and isolated? | **Yes.** `id -un` is `tools`; `/home/user` does not exist inside; an env scan for `token` found nothing. |
| Do the tools work? | **Yes.** `dig +noall +answer example.com A` returned real records; `nmap -sT` on loopback completed. |
| Does a SYN scan work as a non-root user? | **No**, by default: "Couldn't open a raw socket. Error: (1) Operation not permitted". This is the intended default. |
| Does `--cap-add NET_RAW` fix that for the non-root user? | **No.** The live test failed: an added capability is not effective for a non-root process. The opt-in therefore runs the container as root with only `NET_RAW` (the default is every capability dropped). A SYN scan then worked, in the live test. |

Not verified: behaviour under Podman, on macOS Docker Desktop, or with a user-defined network.

## Decisions

### 1. A slim image listing only wrapped tools
Each tool added later is one line in the Dockerfile in the change that wraps it.

### 2. A Bun script, not a compose file
One container does not justify compose. The script is testable against a fake `docker` the way the container runner is, and it keeps flags (`--net-raw`) explicit.

### 3. One fixed name, `viokit-tools`
Matches the engine setting. Starting is idempotent: it checks state first and never creates a second container.

### 4. Limits and init
`--init` reaps zombies from killed tool trees, `--memory 1g` and `--pids-limit 512` bound a runaway tool. They are defaults the script exposes as flags.

### 5. No mounts, default bridge network
Tools reach the internet, which is their purpose, and nothing of the host's. Output returns on stdout, not through a shared directory.

### 6. Raw sockets are opt-in, and the opt-in is root
Matches decision 3 in spirit: no policy restricts targets, but raw-socket scans change what the tool can do to a network, so it is a deliberate choice on `up`. The default drops every capability. The flag runs the container as root with `NET_RAW` only, because the spike showed the capability alone does nothing for a non-root user. That costs some isolation, which is why it is explicit; setting file capabilities on the binary was considered and rejected as fragile (a missing capability makes the binary fail to execute at all).

## Risks / Trade-offs

- **The image drifts as Kali rolls** → rebuild is one command; versions are not pinned, consistent with the project's decision not to pin tool versions.
- **Docker is required** → stated in the impact; the host runner remains for development.
- **No sandbox beyond the container** → a tool can still use the network freely; accepted project decision.
