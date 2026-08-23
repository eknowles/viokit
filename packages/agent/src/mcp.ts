#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Engine } from "@viokit/engine";
import { Cause, Effect, type Layer, ManagedRuntime } from "effect";
import { z } from "zod";
import type { AgentOperation, ArgSpec } from "./operations.js";
import { operations } from "./operations.js";
import { AgentProgramLayer } from "./program.js";

/**
 * The agent surface (TDR-016): every operation in the shared table, exposed as
 * an MCP tool. This module holds no behavior — it maps the table onto the
 * protocol and runs each effect on the provided layer, so an agent exercises
 * exactly the paths the CLI does (I8).
 */

const toText = (value: unknown): string => {
  if (value === undefined) {
    return "ok";
  }
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
};

const textResult = (value: unknown) => ({
  content: [{ text: toText(value), type: "text" as const }],
});

const errorResult = (value: unknown) => ({
  content: [{ text: toText(value), type: "text" as const }],
  isError: true,
});

const baseFor = (kind: ArgSpec["kind"]) => {
  if (kind === "number") {
    return z.number();
  }
  if (kind === "json") {
    return z.unknown();
  }
  return z.string();
};

const zodFor = (spec: ArgSpec) => {
  const described = baseFor(spec.kind).describe(spec.description);
  return spec.optional ? described.optional() : described;
};

const inputSchema = (operation: AgentOperation): z.ZodRawShape =>
  Object.fromEntries(
    operation.args.map((spec) => [spec.name, zodFor(spec)])
  ) as z.ZodRawShape;

/**
 * One runtime for the server's lifetime, so the layer is built once and every
 * tool call hits the same engine. Building per call would give each call a
 * fresh graph and evidence store — state would vanish between an `insert` and
 * the `query_entity` that reads it.
 */
const makeRunTool =
  (runtime: ManagedRuntime.ManagedRuntime<Engine, unknown>) =>
  (operation: AgentOperation, args: Record<string, unknown>) =>
    runtime.runPromise(
      operation.run(args).pipe(
        Effect.matchCause({
          onFailure: (cause) => errorResult(`error: ${Cause.pretty(cause)}`),
          onSuccess: textResult,
        })
      )
    );

export const makeAgentServer = (
  layer: Layer.Layer<Engine, unknown, never> = AgentProgramLayer
) => {
  const server = new McpServer({ name: "viokit", version: "0.0.0" });
  const runTool = makeRunTool(ManagedRuntime.make(layer));

  for (const operation of operations) {
    server.registerTool(
      operation.name,
      {
        description: operation.description,
        inputSchema: inputSchema(operation),
      },
      (args: Record<string, unknown>) => runTool(operation, args)
    );
  }

  return server;
};

export const runMcpServer = async (): Promise<void> => {
  const server = makeAgentServer();
  await server.connect(new StdioServerTransport());
};

if (import.meta.main) {
  await runMcpServer();
}
