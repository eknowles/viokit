import { existsSync } from "node:fs";
import { assert, describe, it } from "@effect/vitest";
import { Effect } from "effect";
import {
  type CommandRequest,
  hostRunner,
  STDERR_EXCERPT_BYTES,
} from "../src/exec-runner.js";

const request = (
  command: string,
  args: readonly string[],
  extra: Partial<CommandRequest> = {}
): CommandRequest => ({
  args,
  command,
  env: {},
  maxOutputBytes: 1_048_576,
  timeoutMs: 10_000,
  ...extra,
});

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const attempt = (req: CommandRequest) =>
  Effect.runPromise(Effect.result(hostRunner.run(req)));

describe("host runner", () => {
  it("delivers a hostile value as one untouched argument", async () => {
    const hostile = "a b; touch /tmp/PWNED $HOME 'q'";
    const result = await Effect.runPromise(
      hostRunner.run(request("echo", [hostile]))
    );
    assert.strictEqual(result.status, 0);
    assert.strictEqual(text(result.stdout), `${hostile}\n`);
  });

  it("does not show the parent environment to the command", async () => {
    process.env.VIOKIT_EXEC_TEST_SECRET = "hunter2";
    try {
      const result = await Effect.runPromise(
        hostRunner.run(
          request("sh", ["-c", 'echo "[$VIOKIT_EXEC_TEST_SECRET]"'])
        )
      );
      assert.strictEqual(text(result.stdout), "[]\n");
    } finally {
      Reflect.deleteProperty(process.env, "VIOKIT_EXEC_TEST_SECRET");
    }
  });

  it("passes only declared variables", async () => {
    const result = await Effect.runPromise(
      hostRunner.run(
        request("sh", ["-c", 'echo "$DECLARED"'], {
          env: { DECLARED: "yes" },
        })
      )
    );
    assert.strictEqual(text(result.stdout), "yes\n");
  });

  it("runs in a throwaway directory that is removed afterwards", async () => {
    const result = await Effect.runPromise(hostRunner.run(request("pwd", [])));
    const directory = text(result.stdout).trim();
    assert.include(directory, "viokit-exec-");
    assert.isFalse(existsSync(directory));
  });

  it("names a command that cannot be found, starting nothing", async () => {
    const result = await attempt(request("viokit-no-such-tool", []));
    assert.strictEqual(result._tag, "Failure");
    assert.include(JSON.stringify(result), "viokit-no-such-tool");
  });

  it("returns a non-zero status and a bounded stderr excerpt", async () => {
    const result = await Effect.runPromise(
      hostRunner.run(
        request("sh", ["-c", "yes error | head -c 100000 >&2; exit 2"])
      )
    );
    assert.strictEqual(result.status, 2);
    assert.isAtMost(result.stderr.length, STDERR_EXCERPT_BYTES);
    assert.include(result.stderr, "error");
  });
});
