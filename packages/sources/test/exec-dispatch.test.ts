import { assert, describe, it } from "@effect/vitest";
import { SourceSpec, SourceTransportService } from "@viokit/schema";
import { Effect, Layer } from "effect";
import { DispatchTransportLayer } from "../src/dispatch.js";
import { ExecRunnerService } from "../src/exec.js";
import type { CommandRequest, CommandRunner } from "../src/exec-runner.js";

const execSource = SourceSpec.make({
  exec: {
    args: ["hello"],
    command: "echo",
    kind: "passive",
    maxOutputBytes: 1024,
    params: [],
    timeoutMs: 5000,
  },
  id: "echo",
  transport: "exec",
  url: "exec:echo",
});

const fetchWith = <E>(layer: Layer.Layer<SourceTransportService, E>) =>
  Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const transport = yield* SourceTransportService;
        return yield* Effect.result(transport.fetch(execSource));
      }),
      layer
    )
  );

describe("dispatching an exec source", () => {
  it("refuses with the missing transport as the reason when none is provided", async () => {
    const result = await fetchWith(DispatchTransportLayer);
    assert.strictEqual(result._tag, "Failure");
    assert.include(JSON.stringify(result), "needs an exec transport");
  });

  it("routes to the runner the deployment provided", async () => {
    const seen: CommandRequest[] = [];
    const runner: CommandRunner = {
      run: (request) =>
        Effect.sync(() => {
          seen.push(request);
          return {
            status: 0,
            stderr: "",
            stdout: new TextEncoder().encode("ran"),
          };
        }),
    };
    const result = await fetchWith(
      Layer.provide(
        DispatchTransportLayer,
        Layer.succeed(ExecRunnerService, runner)
      )
    );
    assert.strictEqual(result._tag, "Success");
    assert.deepStrictEqual(
      seen.map((one) => [one.command, ...one.args]),
      [["echo", "hello"]]
    );
  });
});
