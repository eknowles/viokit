import { assert, describe, it } from "@effect/vitest";
import {
  type AcquisitionContext,
  type EgressDecision,
  SourceSpec,
} from "@viokit/schema";
import { Effect } from "effect";
import { makeExecPermit, makeExecTransport } from "../src/exec.js";
import {
  type CommandRequest,
  type CommandRunner,
  hostRunner,
} from "../src/exec-runner.js";

const sourceOf = (command: string, args: readonly string[]): SourceSpec =>
  SourceSpec.make({
    exec: {
      args,
      command,
      kind: "passive",
      maxOutputBytes: 1024,
      params: [],
      timeoutMs: 5000,
    },
    id: "tool",
    transport: "exec",
    url: `exec:${command}`,
  });

const run = (
  runner: CommandRunner,
  source: SourceSpec,
  context?: AcquisitionContext
) =>
  Effect.runPromise(
    Effect.result(
      Effect.gen(function* () {
        const permit = yield* makeExecPermit(2);
        return yield* makeExecTransport(runner, permit).fetch(source, context);
      })
    )
  );

const proxy: EgressDecision = { path: "proxy", viaProxy: "socks5://p:1080" };

describe("exec transport", () => {
  it("returns standard output as plain text", async () => {
    const result = await run(hostRunner, sourceOf("echo", ["hello"]));
    assert.strictEqual(result._tag, "Success");
    if (result._tag === "Success") {
      assert.strictEqual(result.success.contentType, "text/plain");
      assert.strictEqual(
        new TextDecoder().decode(result.success.bytes),
        "hello\n"
      );
    }
  });

  it("fails a non-zero exit with the status and stderr, recording nothing", async () => {
    const result = await run(
      hostRunner,
      sourceOf("sh", ["-c", "echo partial; echo broke >&2; exit 2"])
    );
    assert.strictEqual(result._tag, "Failure");
    const text = JSON.stringify(result);
    assert.include(text, "status 2");
    assert.include(text, "broke");
    assert.notInclude(text, "partial");
  });

  it("fails before running when the command cannot be found, naming it", async () => {
    const result = await run(hostRunner, sourceOf("viokit-no-such-tool", []));
    assert.strictEqual(result._tag, "Failure");
    assert.include(JSON.stringify(result), "viokit-no-such-tool");
  });

  it("refuses a proxy route without starting anything", async () => {
    const started: CommandRequest[] = [];
    const spy: CommandRunner = {
      run: (request) => {
        started.push(request);
        return hostRunner.run(request);
      },
    };
    const result = await run(spy, sourceOf("echo", ["x"]), {
      egress: proxy,
    });
    assert.strictEqual(result._tag, "Failure");
    assert.include(JSON.stringify(result), "cannot honour a proxy route");
    assert.strictEqual(started.length, 0);
  });

  it("accepts a direct route and does not use kind to refuse", async () => {
    const active = SourceSpec.make({
      ...sourceOf("echo", ["x"]),
      exec: { ...sourceOf("echo", ["x"]).exec, kind: "active" } as never,
    });
    const result = await run(hostRunner, active, { egress: { path: "live" } });
    assert.strictEqual(result._tag, "Success");
  });
});

describe("exec concurrency", () => {
  it("never runs more commands than the limit", async () => {
    let current = 0;
    let peak = 0;
    const slow: CommandRunner = {
      run: () =>
        Effect.gen(function* () {
          current += 1;
          peak = Math.max(peak, current);
          yield* Effect.sleep("30 millis");
          current -= 1;
          return { status: 0, stderr: "", stdout: new Uint8Array() };
        }),
    };
    const source = sourceOf("x", []);
    await Effect.runPromise(
      Effect.gen(function* () {
        const permit = yield* makeExecPermit(2);
        const transport = makeExecTransport(slow, permit);
        yield* Effect.all(
          Array.from({ length: 8 }, () => transport.fetch(source)),
          { concurrency: "unbounded" }
        );
      })
    );
    assert.strictEqual(peak, 2);
  });
});
