import { execFileSync } from "node:child_process";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { type CommandRequest, hostRunner } from "../src/exec-runner.js";

const request = (
  args: readonly string[],
  extra: Partial<CommandRequest> = {}
): CommandRequest => ({
  args,
  command: "sh",
  env: {},
  maxOutputBytes: 1_048_576,
  timeoutMs: 10_000,
  ...extra,
});

const timed = async (req: CommandRequest) => {
  const started = Date.now();
  const result = await Effect.runPromise(Effect.result(hostRunner.run(req)));
  return { elapsedMs: Date.now() - started, result };
};

const failureText = (result: unknown): string => JSON.stringify(result);

const REAP_POLLS = 20;
const REAP_INTERVAL_MS = 50;

const running = (marker: string): string => {
  try {
    return execFileSync("pgrep", ["-f", marker], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

/** A killed process can linger as a zombie until init reaps it; give it time. */
const leftover = async (
  marker: string,
  polls = REAP_POLLS
): Promise<string> => {
  const found = running(marker);
  if (found === "" || polls <= 0) {
    return found;
  }
  await new Promise((done) => setTimeout(done, REAP_INTERVAL_MS));
  return leftover(marker, polls - 1);
};

describe("host runner limits", () => {
  it("ends a command that ignores termination and starts a child", async () => {
    // A unique sleep length marks this test's processes for the leftover scan.
    const marker = "sleep 31.417";
    const { elapsedMs, result } = await timed(
      request(["-c", `trap '' TERM; ${marker} & ${marker}`], {
        timeoutMs: 500,
      })
    );
    assert.strictEqual(result._tag, "Failure");
    assert.include(failureText(result), "timed out after 500 ms");
    assert.isBelow(elapsedMs, 2000);
    assert.strictEqual(await leftover(marker), "");
  });

  it("stops a flood at the cap, fails, and returns no partial output", async () => {
    const { elapsedMs, result } = await timed(
      request(["-c", "yes"], { maxOutputBytes: 1_000_000 })
    );
    assert.strictEqual(result._tag, "Failure");
    assert.include(failureText(result), "1000000 bytes");
    assert.isBelow(elapsedMs, 2000);
  });

  it("ends the group on cap even when a child holds the pipe", async () => {
    const marker = "sleep 31.418";
    const { elapsedMs, result } = await timed(
      request(["-c", `${marker} & yes`], { maxOutputBytes: 100_000 })
    );
    assert.strictEqual(result._tag, "Failure");
    assert.isBelow(elapsedMs, 2000);
    assert.strictEqual(await leftover(marker), "");
  });

  it("lets a command inside its limits finish", async () => {
    const { result } = await timed(request(["-c", "echo ok"]));
    assert.strictEqual(result._tag, "Success");
  });
});
