#!/usr/bin/env bun
import { parseArgs } from "node:util";
import type { Engine } from "@viokit/engine";
import { Cause, Effect, type Layer } from "effect";
import type { AgentOperation, ArgSpec } from "./operations.js";
import { findOperation, operations } from "./operations.js";
import { AgentProgramLayer } from "./program.js";

/**
 * The human surface (TDR-016): the same operation table as commands. Like the
 * MCP server, this module holds no behavior of its own (I8) — it parses flags
 * per each operation's declared arguments, hands them to the table, and prints
 * the result. Failures exit non-zero so a script can tell them from success.
 */

const usage = (): string => {
  const lines = operations.map((operation) => {
    const flags = operation.args
      .map((spec) =>
        spec.optional ? `[--${spec.name} <v>]` : `--${spec.name} <v>`
      )
      .join(" ");
    return `  ${operation.name} ${flags}\n      ${operation.description}`;
  });
  return `
viokit — CLI over the Engine (same operations as the MCP server).

Usage:
${lines.join("\n")}

JSON-valued flags take a JSON literal, e.g. --input '{"domain":"acme.test"}'.
`;
};

const coerce = (spec: ArgSpec, raw: string): unknown => {
  if (spec.kind === "number") {
    return Number(raw);
  }
  if (spec.kind === "json") {
    return JSON.parse(raw);
  }
  return raw;
};

const collect = (
  operation: AgentOperation,
  values: Record<string, string | boolean | undefined>
): Record<string, unknown> => {
  const args: Record<string, unknown> = {};
  for (const spec of operation.args) {
    const raw = values[spec.name];
    if (typeof raw !== "string") {
      if (!spec.optional) {
        throw new Error(`--${spec.name} is required for ${operation.name}`);
      }
      continue;
    }
    args[spec.name] = coerce(spec, raw);
  }
  return args;
};

export const runCli = async (
  argv: readonly string[],
  layer: Layer.Layer<Engine, unknown, never> = AgentProgramLayer
): Promise<number> => {
  const [command, ...rest] = argv;
  const operation = command === undefined ? undefined : findOperation(command);
  if (operation === undefined) {
    process.stdout.write(usage());
    return command === undefined ? 0 : 1;
  }

  const options = Object.fromEntries(
    operation.args.map((spec) => [spec.name, { type: "string" as const }])
  );

  try {
    const { values } = parseArgs({ args: [...rest], options, strict: true });
    const args = collect(operation, values);
    const output = await Effect.runPromise(
      operation.run(args).pipe(
        Effect.provide(layer),
        Effect.matchCause({
          onFailure: (cause) => ({
            ok: false,
            text: `error: ${Cause.pretty(cause)}`,
          }),
          onSuccess: (value) => ({
            ok: true,
            text: value === undefined ? "ok" : JSON.stringify(value, null, 2),
          }),
        })
      )
    );
    if (output.ok) {
      process.stdout.write(`${output.text}\n`);
      return 0;
    }
    process.stderr.write(`${output.text}\n`);
    return 1;
  } catch (cause) {
    process.stderr.write(
      `error: ${cause instanceof Error ? cause.message : String(cause)}\n`
    );
    return 1;
  }
};

if (import.meta.main) {
  process.exit(await runCli(process.argv.slice(2)));
}
