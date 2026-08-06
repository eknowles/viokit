import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Cause, Effect, type Layer } from "effect";
import { z } from "zod";
import type { SourceCatalog } from "./catalog.js";
import { SourceCatalogService } from "./catalog.js";
import { SourceCatalogProgramLayer } from "./program.js";

const toText = (value: unknown): string => {
  if (value === undefined) {
    return "ok";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
};

const textResult = (value: unknown) => ({
  content: [{ text: toText(value), type: "text" as const }],
});

/**
 * Runs an effect on a provided layer, serializing success/error to an MCP text
 * result. Front-ends stay logic-free: everything here delegates to
 * `SourceCatalogService` (I8), which decodes the payload (I6).
 */
const makeRunTool =
  (layer: Layer.Layer<SourceCatalogService, unknown, never>) =>
  <A, AE>(effect: Effect.Effect<A, AE, SourceCatalogService>) =>
    Effect.runPromise(
      effect.pipe(
        Effect.provide(layer),
        Effect.matchCause({
          onFailure: (cause) => textResult(`error: ${Cause.pretty(cause)}`),
          onSuccess: textResult,
        })
      )
    );

const serviceEffect = <A, E>(fn: (svc: SourceCatalog) => Effect.Effect<A, E>) =>
  Effect.gen(function* () {
    const svc = yield* SourceCatalogService;
    return yield* fn(svc);
  });

export const makeSourceCatalogServer = (
  layer: Layer.Layer<
    SourceCatalogService,
    unknown,
    never
  > = SourceCatalogProgramLayer
) => {
  const server = new McpServer({
    name: "viokit-source-catalog",
    version: "0.0.0",
  });
  const runTool = makeRunTool(layer);

  server.registerTool(
    "claim_work",
    {
      description:
        "Claim the next unclaimed discovery work unit for an agent (30-min lease).",
      inputSchema: { agent: z.string().describe("agent id claiming the unit") },
    },
    ({ agent }) => runTool(serviceEffect((svc) => svc.claimWork(agent)))
  );

  server.registerTool(
    "submit_candidate",
    {
      description:
        "Submit a discovered source candidate. Deduplicated by (domain, url).",
      inputSchema: {
        access: z.string().optional(),
        archetypes: z.array(z.string()).min(1),
        category: z.string(),
        description: z.string().optional(),
        discoveredBy: z.string().optional(),
        domain: z.string(),
        origin: z.string().optional(),
        transport: z.string().optional(),
        url: z.string(),
      },
    },
    (args) => runTool(serviceEffect((svc) => svc.submitCandidate(args)))
  );

  server.registerTool(
    "enrich_candidate",
    {
      description:
        "Add classification/provenance to an existing candidate (access, transport, description, origin, archetype, note).",
      inputSchema: {
        access: z.string().optional(),
        archetype: z.string().optional(),
        description: z.string().optional(),
        id: z.string(),
        note: z.string().optional(),
        origin: z.string().optional(),
        transport: z.string().optional(),
      },
    },
    (args) =>
      runTool(serviceEffect((svc) => svc.enrichCandidate(args.id, args)))
  );

  server.registerTool(
    "list_candidates",
    {
      description:
        "List candidates, optionally filtered by category/archetype/status.",
      inputSchema: {
        archetype: z.string().optional(),
        category: z.string().optional(),
        status: z.string().optional(),
      },
    },
    (args) => runTool(serviceEffect((svc) => svc.listCandidates(args)))
  );

  server.registerTool(
    "promote_source",
    {
      description:
        "Promote a candidate into a pack SourceSpec (writes packs/<category>/sources.ts, marks promoted).",
      inputSchema: {
        id: z.string(),
        spec: z.record(z.string(), z.unknown()),
      },
    },
    (args) =>
      runTool(serviceEffect((svc) => svc.promoteSource(args.id, args.spec)))
  );

  return server;
};

export const runMcpServer = async (): Promise<void> => {
  const server = makeSourceCatalogServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

if (import.meta.main) {
  await runMcpServer();
}
