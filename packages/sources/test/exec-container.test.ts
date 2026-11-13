import { execFile, execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, assert, beforeAll, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  type CommandRequest,
  dockerExecArgs,
  makeContainerRunner,
} from "../src/exec-runner.js";

/**
 * The container runner is proven by the exact command line it builds and by how
 * it reads docker's own failures, against a fake `docker` on PATH. A live run
 * is opt-in: set VIOKIT_EXEC_CONTAINER to the name of a running container.
 */

const FAKE_DOCKER = `#!/bin/sh
# argv: exec --workdir DIR [-e K=V]... CONTAINER CMD ARGS...
for arg in "$@"; do
  case "$arg" in
    gone) echo "Error response from daemon: container gone is not running" >&2; exit 1 ;;
    absent) echo "Error response from daemon: No such container: absent" >&2; exit 1 ;;
    nocmd) echo 'OCI runtime exec failed: exec failed: unable to start container process: exec: "tool": executable file not found in $PATH: unknown' >&2; exit 126 ;;
    fail) echo "tool broke" >&2; exit 3 ;;
  esac
done
printf '%s\\n' "$@"
`;

const request = (extra: Partial<CommandRequest> = {}): CommandRequest => ({
  args: ["+short", "a b; $HOME", "A"],
  command: "dig",
  env: { ALPHA: "1", LANG: "C" },
  maxOutputBytes: 65_536,
  timeoutMs: 10_000,
  ...extra,
});

let originalPath: string | undefined;

beforeAll(() => {
  const directory = mkdtempSync(join(tmpdir(), "viokit-fake-docker-"));
  const script = join(directory, "docker");
  writeFileSync(script, FAKE_DOCKER);
  chmodSync(script, 0o755);
  originalPath = process.env.PATH;
  process.env.PATH = `${directory}:${originalPath ?? ""}`;
});

afterAll(() => {
  process.env.PATH = originalPath;
});

const outcome = (container: string, req = request()) =>
  Effect.runPromise(Effect.result(makeContainerRunner({ container }).run(req)));

describe("container runner", () => {
  it("builds an argument-array docker exec with workdir and declared env", () => {
    assert.deepStrictEqual(
      dockerExecArgs({ container: "kali", workdir: "/work" }, request()),
      [
        "exec",
        "--workdir",
        "/work",
        "-e",
        "ALPHA=1",
        "-e",
        "LANG=C",
        "kali",
        "timeout",
        "-s",
        "KILL",
        String(Math.ceil(request().timeoutMs / 1000) + 1),
        "dig",
        "+short",
        "a b; $HOME",
        "A",
      ]
    );
  });

  it("defaults the working directory explicitly", () => {
    assert.deepStrictEqual(
      dockerExecArgs({ container: "kali" }, request({ env: {} })).slice(0, 3),
      ["exec", "--workdir", "/tmp"]
    );
  });

  it("passes that exact line to docker, hostile value intact", async () => {
    const result = await outcome("kali");
    assert.strictEqual(result._tag, "Success");
    if (result._tag === "Success") {
      assert.deepStrictEqual(
        new TextDecoder().decode(result.success.stdout).trimEnd().split("\n"),
        [...dockerExecArgs({ container: "kali" }, request())]
      );
    }
  });

  it("names the container when it is not running", async () => {
    const containers = ["gone", "absent"];
    const results = await Promise.all(containers.map((one) => outcome(one)));
    for (const [index, result] of results.entries()) {
      assert.strictEqual(result._tag, "Failure");
      assert.include(
        JSON.stringify(result),
        `container '${containers[index]}'`
      );
      assert.include(JSON.stringify(result), "is not running");
    }
  });

  it("names a command missing inside the container", async () => {
    const result = await outcome("nocmd");
    assert.strictEqual(result._tag, "Failure");
    assert.include(JSON.stringify(result), "command 'dig'");
    assert.include(JSON.stringify(result), "container 'nocmd'");
  });

  it("returns the tool's own non-zero status to the transport", async () => {
    const result = await outcome("fail");
    assert.strictEqual(result._tag, "Success");
    if (result._tag === "Success") {
      assert.strictEqual(result.success.status, 3);
      assert.include(result.success.stderr, "tool broke");
    }
  });

  it("names the docker client when it is missing", async () => {
    const result = await Effect.runPromise(
      Effect.result(
        makeContainerRunner({
          container: "kali",
          docker: "viokit-no-such-docker",
        }).run(request())
      )
    );
    assert.strictEqual(result._tag, "Failure");
    assert.include(JSON.stringify(result), "docker client was not found");
  });
});

const liveContainer = process.env.VIOKIT_EXEC_CONTAINER;

/** The real docker, found on the PATH from before the fake was installed. */
const realDocker = (): string =>
  execFileSync("sh", ["-c", "command -v docker"], {
    encoding: "utf8",
    env: { PATH: originalPath ?? "" },
  }).trim();

const insideContainerHas = (pattern: string): Promise<boolean> =>
  new Promise((resolve) => {
    execFile(
      realDocker(),
      [
        "exec",
        liveContainer ?? "",
        "sh",
        "-c",
        `pgrep -f '${pattern}' >/dev/null`,
      ],
      (error) => resolve(error === null)
    );
  });

describe("container runner against a real container (opt-in)", () => {
  it.skipIf(liveContainer === undefined)(
    "runs echo in VIOKIT_EXEC_CONTAINER",
    async () => {
      const result = await Effect.runPromise(
        makeContainerRunner({
          container: liveContainer ?? "",
          docker: realDocker(),
        }).run(request({ args: ["hello"], command: "echo", env: {} }))
      );
      assert.strictEqual(result.status, 0);
      assert.strictEqual(new TextDecoder().decode(result.stdout), "hello\n");
    }
  );

  it.skipIf(liveContainer === undefined)(
    "does not leave a timed-out command running inside the container",
    async () => {
      // A duration unique to this run, so a leftover process from an earlier
      // run cannot be mistaken for this one. `[s]leep` keeps the probe from
      // matching its own command line.
      const seconds = 200 + Math.floor(Math.random() * 700);
      const probe = `[s]leep ${seconds}`;
      const outcomeOfRun = await Effect.runPromise(
        Effect.result(
          makeContainerRunner({
            container: liveContainer ?? "",
            docker: realDocker(),
          }).run(
            request({
              args: [String(seconds)],
              command: "sleep",
              env: {},
              timeoutMs: 1000,
            })
          )
        )
      );
      assert.strictEqual(outcomeOfRun._tag, "Failure");
      assert.include(JSON.stringify(outcomeOfRun), "timed out");
      // The in-container timeout fires one second after the host's: bounded.
      const LEAK_BOUND_MS = 4000;
      const POLL_MS = 250;
      const deadline = Date.now() + LEAK_BOUND_MS;
      let running = await insideContainerHas(probe);
      while (running && Date.now() < deadline) {
        // biome-ignore lint/performance/noAwaitInLoops: polling is sequential
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        running = await insideContainerHas(probe);
      }
      assert.isFalse(running);
    }
  );
});
