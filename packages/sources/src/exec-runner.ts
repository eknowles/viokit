import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { SourceError } from "@viokit/schema";
import { Effect } from "effect";

/**
 * Runners for the `exec` transport (design.md decisions 2, 7, 8).
 *
 * A runner turns a command and its argument array into bytes. Two exist: the
 * host runner spawns a local process, and the container runner builds a
 * `docker exec` argument array and runs it through the same machinery, so the
 * timeout, the output cap and the process-group kill live once, here, and
 * behave the same for both. No shell is involved anywhere: every call is an
 * executable and an array.
 */

/** What a runner is asked to run. `env` is the whole of what the tool sees. */
export interface CommandRequest {
  readonly args: readonly string[];
  readonly command: string;
  readonly env: Readonly<Record<string, string>>;
  readonly maxOutputBytes: number;
  readonly timeoutMs: number;
}

export interface CommandResult {
  readonly status: number;
  /** A bounded excerpt of standard error, for the failure message. */
  readonly stderr: string;
  readonly stdout: Uint8Array;
}

export interface CommandRunner {
  readonly run: (
    request: CommandRequest
  ) => Effect.Effect<CommandResult, SourceError>;
}

/** How much standard error is kept; the rest is read and dropped. */
export const STDERR_EXCERPT_BYTES = 2048;

const KILL_SIGNAL = "SIGKILL";
const DEFAULT_PATH = "/usr/local/bin:/usr/bin:/bin";

type SpawnOutcome =
  | {
      readonly _tag: "exited";
      readonly status: number;
      readonly stderr: string;
      readonly stdout: Uint8Array;
    }
  | { readonly _tag: "failed"; readonly message: string }
  | { readonly _tag: "missing" }
  | { readonly _tag: "overflow" }
  | { readonly _tag: "timeout" };

interface SpawnRequest {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly file: string;
  readonly maxOutputBytes: number;
  readonly timeoutMs: number;
}

/**
 * Starts `file` as the leader of its own process group and ends the whole group
 * on timeout, on output over the cap, and on interruption. Killing only the
 * direct child is not enough: the spike showed orphaned children holding the
 * output pipe open for the full 30 s of their sleep (design.md, Spike).
 */
const spawnLimited = (request: SpawnRequest): Effect.Effect<SpawnOutcome> =>
  Effect.callback<SpawnOutcome>((resume) => {
    let settled = false;
    let outputBytes = 0;
    let stderr = "";
    const out: Buffer[] = [];

    const child = spawn(request.file, [...request.argv], {
      cwd: request.cwd,
      detached: true,
      env: { ...request.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const killGroup = (): void => {
      if (child.pid === undefined) {
        return;
      }
      try {
        process.kill(-child.pid, KILL_SIGNAL);
      } catch {
        // The group is already gone, which is the state we wanted.
      }
    };

    const settle = (outcome: SpawnOutcome): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resume(Effect.succeed(outcome));
    };

    const timer = setTimeout(() => {
      killGroup();
      settle({ _tag: "timeout" });
    }, request.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > request.maxOutputBytes) {
        // Stop reading and end the group; partial output is never returned.
        killGroup();
        settle({ _tag: "overflow" });
        return;
      }
      out.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < STDERR_EXCERPT_BYTES) {
        stderr = `${stderr}${chunk.toString("utf8")}`.slice(
          0,
          STDERR_EXCERPT_BYTES
        );
      }
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      settle(
        error.code === "ENOENT"
          ? { _tag: "missing" }
          : { _tag: "failed", message: error.message }
      );
    });
    child.on("close", (status) => {
      // A group left running after its leader exits is ended too.
      killGroup();
      settle({
        _tag: "exited",
        status: status ?? 128,
        stderr,
        stdout: new Uint8Array(Buffer.concat(out)),
      });
    });

    return Effect.sync(() => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        killGroup();
      }
    });
  });

/** A fresh directory that holds no investigation data, removed afterwards. */
const withThrowawayDirectory = <A, E>(
  use: (directory: string) => Effect.Effect<A, E>
): Effect.Effect<A, E | SourceError> =>
  Effect.acquireUseRelease(
    Effect.tryPromise({
      catch: (cause) =>
        SourceError.make({
          message: `cannot create a working directory: ${String(cause)}`,
        }),
      try: () => mkdtemp(join(tmpdir(), "viokit-exec-")),
    }),
    use,
    (directory) =>
      Effect.promise(() => rm(directory, { force: true, recursive: true }))
  );

const parentPath = (): string => process.env.PATH ?? DEFAULT_PATH;

const toResult = (
  outcome: SpawnOutcome,
  request: CommandRequest,
  onMissing: SourceError
): Effect.Effect<CommandResult, SourceError> => {
  switch (outcome._tag) {
    case "exited":
      return Effect.succeed({
        status: outcome.status,
        stderr: outcome.stderr,
        stdout: outcome.stdout,
      });
    case "timeout":
      return SourceError.make({
        message: `command '${request.command}' timed out after ${request.timeoutMs} ms`,
      });
    case "overflow":
      return SourceError.make({
        message: `command '${request.command}' wrote more than its cap of ${request.maxOutputBytes} bytes of output`,
      });
    case "missing":
      return Effect.fail(onMissing);
    default:
      return SourceError.make({
        message: `command '${request.command}' could not be run: ${outcome.message}`,
      });
  }
};

/**
 * The host runner: a local process with an environment of `PATH` plus what the
 * source declares, in a throwaway working directory. For development and tools
 * installed locally; the container is the isolation boundary (decision 8).
 */
export const hostRunner: CommandRunner = {
  run: (request) =>
    withThrowawayDirectory((cwd) =>
      Effect.flatMap(
        spawnLimited({
          argv: request.args,
          cwd,
          env: { PATH: parentPath(), ...request.env },
          file: request.command,
          maxOutputBytes: request.maxOutputBytes,
          timeoutMs: request.timeoutMs,
        }),
        (outcome) =>
          toResult(
            outcome,
            request,
            SourceError.make({
              message: `command '${request.command}' was not found on this host`,
            })
          )
      )
    ),
};

export interface ContainerRunnerConfig {
  /** The running container to execute in. */
  readonly container: string;
  /** The docker executable; overridable so tests can supply a fake. */
  readonly docker?: string;
  /** The working directory inside the container. */
  readonly workdir?: string;
}

export const DEFAULT_CONTAINER_WORKDIR = "/tmp";
const MS_PER_SECOND = 1000;

/**
 * The exact argument array handed to `docker`. Exported because the container
 * runner is verified here by the command line it builds (design.md, Spike).
 * Only the variables the source declares are passed in.
 */
export const dockerExecArgs = (
  config: ContainerRunnerConfig,
  request: CommandRequest
): readonly string[] => [
  "exec",
  "--workdir",
  config.workdir ?? DEFAULT_CONTAINER_WORKDIR,
  ...Object.entries(request.env)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([name, value]) => ["-e", `${name}=${value}`]),
  config.container,
  // Killing the `docker exec` client does not stop the process inside the
  // container (Docker forwards no signal without a TTY; spike on a real
  // container reproduced it). The container's own `timeout` ends it, so the
  // leak is bounded. It fires a second after the host's timer so the host
  // reports the timeout, and GNU `timeout` kills the whole process group.
  "timeout",
  "-s",
  "KILL",
  String(Math.ceil(request.timeoutMs / MS_PER_SECOND) + 1),
  request.command,
  ...request.args,
];

const NOT_RUNNING = /is not running|No such container/i;
const COMMAND_MISSING = /executable file not found|no such file or directory/i;
const DOCKER_CANNOT_EXEC = 126;
const DOCKER_NOT_FOUND = 127;

/**
 * Runs the command inside a named running container via `docker exec`. The
 * `docker` client itself is started with only `PATH` and its own connection
 * settings; the tool's environment is what `-e` passes.
 */
export const makeContainerRunner = (
  config: ContainerRunnerConfig
): CommandRunner => ({
  run: (request) =>
    withThrowawayDirectory((cwd) =>
      Effect.flatMap(
        spawnLimited({
          argv: dockerExecArgs(config, request),
          cwd,
          env: dockerClientEnv(),
          file: config.docker ?? "docker",
          maxOutputBytes: request.maxOutputBytes,
          timeoutMs: request.timeoutMs,
        }),
        (outcome) =>
          Effect.flatMap(
            toResult(
              outcome,
              request,
              SourceError.make({
                message: `cannot run '${request.command}' in container '${config.container}': the docker client was not found`,
              })
            ),
            (result) => classifyDockerResult(config, request, result)
          )
      )
    ),
});

const dockerClientEnv = (): Record<string, string> => {
  const env: Record<string, string> = { PATH: parentPath() };
  for (const name of ["DOCKER_HOST", "DOCKER_CONFIG", "HOME"]) {
    const value = process.env[name];
    if (value !== undefined) {
      env[name] = value;
    }
  }
  return env;
};

/** Turns docker's own failures into errors naming the container or command. */
const classifyDockerResult = (
  config: ContainerRunnerConfig,
  request: CommandRequest,
  result: CommandResult
): Effect.Effect<CommandResult, SourceError> => {
  if (result.status !== 0 && NOT_RUNNING.test(result.stderr)) {
    return SourceError.make({
      message: `container '${config.container}' is not running`,
    });
  }
  const dockerFailed =
    result.status === DOCKER_CANNOT_EXEC || result.status === DOCKER_NOT_FOUND;
  if (dockerFailed && COMMAND_MISSING.test(result.stderr)) {
    return SourceError.make({
      message: `command '${request.command}' was not found in container '${config.container}'`,
    });
  }
  return Effect.succeed(result);
};
