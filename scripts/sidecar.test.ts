import { describe, expect, it } from "bun:test";
import {
  buildArgs,
  CONTAINER,
  type Docker,
  type DockerResult,
  downArgs,
  envLine,
  IMAGE,
  inspectArgs,
  run,
  stateOf,
  upArgs,
} from "./sidecar.js";

const result = (code: number, stdout = "", stderr = ""): DockerResult => ({
  code,
  stderr,
  stdout,
});

/** A docker whose answers are scripted and whose calls are recorded. */
const fake = (answers: readonly DockerResult[]) => {
  const calls: (readonly string[])[] = [];
  let index = 0;
  const docker: Docker = (args) => {
    calls.push(args);
    const answer = answers[index] ?? result(0);
    index += 1;
    return Promise.resolve(answer);
  };
  return { calls, docker };
};

describe("sidecar command lines", () => {
  it("builds from the sidecar directory", () => {
    expect(buildArgs()).toEqual(["build", "-q", "-t", IMAGE, "sidecar"]);
  });

  it("starts with limits, an init process, no mounts and no raw sockets by default", () => {
    const args = upArgs({ netRaw: false });
    expect(args).toContain("--rm");
    expect(args).toContain("--init");
    expect(args).toContain("--memory");
    expect(args).toContain("--pids-limit");
    expect(args).toContain(CONTAINER);
    expect(args[args.indexOf("--cap-drop") + 1]).toBe("ALL");
    expect(args).not.toContain("--cap-add");
    expect(args).not.toContain("--user");
    expect(args).not.toContain("-v");
    expect(args).not.toContain("--volume");
    expect(args).not.toContain("--mount");
  });

  it("grants raw sockets only with the flag", () => {
    const args = upArgs({ netRaw: true });
    expect(args[args.indexOf("--cap-add") + 1]).toBe("NET_RAW");
    expect(args[args.indexOf("--user") + 1]).toBe("root");
  });

  it("prints the setting the engine already reads", () => {
    expect(envLine()).toBe(`export VIOKIT_EXEC_CONTAINER=${CONTAINER}`);
  });
});

describe("sidecar state", () => {
  it("maps docker's answers to running, stopped or absent", () => {
    expect(stateOf(result(0, "running\n"))).toBe("running");
    expect(stateOf(result(0, "exited\n"))).toBe("stopped");
    expect(stateOf(result(0, "created\n"))).toBe("stopped");
    expect(stateOf(result(1, "", "No such object"))).toBe("absent");
  });

  for (const [answer, expected] of [
    [result(0, "running"), "running"],
    [result(0, "exited"), "stopped"],
    [result(1), "absent"],
  ] as const) {
    it(`reports ${expected} through the status command`, async () => {
      const { docker } = fake([answer]);
      expect((await run(["status"], docker)).message).toBe(expected);
    });
  }
});

describe("sidecar commands", () => {
  it("starts when absent", async () => {
    const { calls, docker } = fake([result(1), result(0, "abc123")]);
    const outcome = await run(["up"], docker);
    expect(outcome.code).toBe(0);
    expect(calls[0]).toEqual(inspectArgs());
    expect(calls[1]).toEqual(upArgs({ netRaw: false }));
  });

  it("does not create a second container when already running", async () => {
    const { calls, docker } = fake([result(0, "running")]);
    const outcome = await run(["up"], docker);
    expect(outcome.message).toContain("already running");
    expect(calls).toHaveLength(1);
  });

  it("passes the raw-socket flag through to the start line", async () => {
    const { calls, docker } = fake([result(1), result(0)]);
    await run(["up", "--net-raw"], docker);
    expect(calls[1]).toEqual(upArgs({ netRaw: true }));
  });

  it("says to build when the image is missing", async () => {
    const { docker } = fake([
      result(1),
      result(125, "", "Unable to find image"),
    ]);
    const outcome = await run(["up"], docker);
    expect(outcome.code).toBe(1);
    expect(outcome.message).toContain("bun run sidecar build");
  });

  it("stops the named container", async () => {
    const { calls, docker } = fake([result(0)]);
    await run(["down"], docker);
    expect(calls[0]).toEqual(downArgs());
  });

  it("rejects an unknown command", async () => {
    const { docker } = fake([]);
    expect((await run(["nope"], docker)).code).toBe(2);
  });
});
