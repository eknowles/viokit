import type {
  AcquisitionContext,
  SourceSpec,
  TransportResult,
} from "@viokit/schema";
import { SourceError } from "@viokit/schema";
import { Context, Effect, Layer, Semaphore } from "effect";
import {
  type CommandRunner,
  type ContainerRunnerConfig,
  hostRunner,
  makeContainerRunner,
  STDERR_EXCERPT_BYTES,
} from "./exec-runner.js";

/**
 * The `transport: "exec"` producer (design.md decisions 1, 6, 7, 10): runs a
 * source's command through the deployment's runner and returns its standard
 * output as the acquisition's bytes. Retry, rate limit, cache and egress stay
 * with `SourceRuntime`; this is only the transport behind the seam, so a
 * command is never started by a transform or a front end (I4/I10).
 */

/** The runner a deployment chose for exec sources: the host, or a container. */
export class ExecRunnerService extends Context.Service<
  ExecRunnerService,
  CommandRunner
>()("ExecRunnerService") {}

/** How many commands may run at once in a deployment. */
export class ExecConcurrency extends Context.Service<ExecConcurrency, number>()(
  "ExecConcurrency"
) {}

export const defaultExecConcurrency = 4;

export const HostExecRunnerLayer: Layer.Layer<ExecRunnerService> =
  Layer.succeed(ExecRunnerService, hostRunner);

export const containerExecRunnerLayer = (
  config: ContainerRunnerConfig
): Layer.Layer<ExecRunnerService> =>
  Layer.succeed(ExecRunnerService, makeContainerRunner(config));

/**
 * The deployment-wide gate: one semaphore shared by every acquisition, built
 * where the deployment decides it has an exec transport at all.
 */
export const makeExecPermit = (
  limit: number = defaultExecConcurrency
): Effect.Effect<Semaphore.Semaphore> => Semaphore.make(limit);

export const makeExecTransport = (
  runner: CommandRunner,
  permit: Semaphore.Semaphore
) => ({
  fetch: (
    source: SourceSpec,
    context?: AcquisitionContext
  ): Effect.Effect<TransportResult, SourceError> =>
    Effect.gen(function* () {
      const { exec } = source;
      if (exec === undefined) {
        return yield* SourceError.make({
          message: `source '${source.id}' declares the exec transport but no exec block`,
        });
      }
      const route = context === undefined ? undefined : context.egress;
      if (route?.path === "proxy") {
        // The command's traffic leaves by its own route, so claiming a proxy in
        // the evidence would be the I10 failure TDR-022 exists to prevent.
        return yield* SourceError.make({
          message: `cannot acquire '${source.id}' by exec: the exec transport cannot honour a proxy route`,
        });
      }

      const result = yield* Semaphore.withPermit(
        permit,
        runner.run({
          args: exec.args,
          command: exec.command,
          env: exec.env ?? {},
          maxOutputBytes: exec.maxOutputBytes,
          timeoutMs: exec.timeoutMs,
        })
      );
      if (result.status !== 0) {
        const excerpt = result.stderr.trim().slice(0, STDERR_EXCERPT_BYTES);
        return yield* SourceError.make({
          message: `command '${exec.command}' exited with status ${result.status}${
            excerpt === "" ? "" : `: ${excerpt}`
          }`,
        });
      }
      return { bytes: result.stdout, contentType: "text/plain" };
    }),
});
