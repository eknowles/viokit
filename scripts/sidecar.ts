/**
 * Builds and runs the tool sidecar: the container the exec transport's
 * container runner executes wrapped tools in. See openspec/changes/tool-sidecar.
 *
 *   bun run sidecar build | up [--net-raw] | down | status | env
 */

export const CONTAINER = "viokit-tools";
export const IMAGE = "viokit-tools:latest";
export const ENV_NAME = "VIOKIT_EXEC_CONTAINER";
const MEMORY = "1g";
const PIDS = "512";
const STOP_GRACE_SECONDS = "2";

export type SidecarState = "running" | "stopped" | "absent";

export interface DockerResult {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

export type Docker = (args: readonly string[]) => Promise<DockerResult>;

export const buildArgs = (): readonly string[] => [
  "build",
  "-q",
  "-t",
  IMAGE,
  "sidecar",
];

/**
 * No mounts, an init process to reap killed trees, bounded memory and
 * processes, and every capability dropped. `--cap-add NET_RAW` alone does not
 * give a non-root user raw sockets (live test), so the opt-in runs the
 * container as root with only that capability.
 */
export const upArgs = (options: {
  readonly netRaw: boolean;
}): readonly string[] => [
  "run",
  "-d",
  "--rm",
  "--init",
  "--name",
  CONTAINER,
  "--memory",
  MEMORY,
  "--pids-limit",
  PIDS,
  "--cap-drop",
  "ALL",
  ...(options.netRaw ? ["--user", "root", "--cap-add", "NET_RAW"] : []),
  IMAGE,
];

export const downArgs = (): readonly string[] => [
  "stop",
  "-t",
  STOP_GRACE_SECONDS,
  CONTAINER,
];

export const inspectArgs = (): readonly string[] => [
  "inspect",
  "-f",
  "{{.State.Status}}",
  CONTAINER,
];

export const stateOf = (result: DockerResult): SidecarState => {
  if (result.code !== 0) {
    return "absent";
  }
  return result.stdout.trim() === "running" ? "running" : "stopped";
};

export const envLine = (): string => `export ${ENV_NAME}=${CONTAINER}`;

export const realDocker: Docker = async (args) => {
  const proc = Bun.spawn(["docker", ...args], {
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stderr, stdout };
};

export interface Outcome {
  readonly code: number;
  readonly message: string;
}

const ok = (message: string): Outcome => ({ code: 0, message });
const fail = (message: string): Outcome => ({ code: 1, message });

export const run = async (
  argv: readonly string[],
  docker: Docker
): Promise<Outcome> => {
  const [command] = argv;
  switch (command) {
    case "build": {
      const result = await docker(buildArgs());
      return result.code === 0
        ? ok(`built ${IMAGE}`)
        : fail(`build failed: ${result.stderr.trim()}`);
    }
    case "up": {
      const state = stateOf(await docker(inspectArgs()));
      if (state === "running") {
        return ok(`${CONTAINER} is already running`);
      }
      const result = await docker(
        upArgs({ netRaw: argv.includes("--net-raw") })
      );
      return result.code === 0
        ? ok(`${CONTAINER} started`)
        : fail(
            `could not start ${CONTAINER}: ${result.stderr.trim()} (run \`bun run sidecar build\` first if the image is missing)`
          );
    }
    case "down": {
      const result = await docker(downArgs());
      return result.code === 0
        ? ok(`${CONTAINER} stopped`)
        : fail(`${CONTAINER} is not running`);
    }
    case "status":
      return ok(stateOf(await docker(inspectArgs())));
    case "env":
      return ok(envLine());
    default:
      return {
        code: command === undefined || command === "--help" ? 0 : 2,
        message:
          "usage: bun run sidecar <build | up [--net-raw] | down | status | env>",
      };
  }
};

if (import.meta.main) {
  const outcome = await run(process.argv.slice(2), realDocker);
  process.stdout.write(`${outcome.message}\n`);
  process.exit(outcome.code);
}
