import { parseArgs } from "node:util";
import { Cause, Effect } from "effect";
import { SourceCatalogService } from "./catalog.js";
import { SourceCatalogProgramLayer } from "./program.js";

const usage = `
viokit-source-catalog — CLI over the SourceCatalog service (same calls as the MCP server).

Usage:
  cli seed                                Seed the work queue (category × archetype grid)
  cli claim --agent <id>                  Claim the next work unit for an agent
  cli list [--category <c>] [--archetype <a>] [--status <s>]
  cli submit --category <c> --domain <d> --url <u> --archetype <a1>[,<a2>...]
        [--access <a>] [--transport <t>] [--description <d>] [--origin <o>] [--discoveredBy <who>]
  cli enrich --id <id> [--access <a>] [--transport <t>] [--description <d>]
        [--origin <o>] [--archetype <a>] [--note <n>]
  cli promote --id <id> --spec <json>     Promote a candidate into a pack SourceSpec
`;

const csv = (value: string | undefined): string[] | undefined =>
  value?.split(",").filter((part) => part.length > 0);

const requireString = (value: string | undefined, flag: string): string => {
  if (value === undefined) {
    throw new Error(`${flag} is required`);
  }
  return value;
};

const main = Effect.gen(function* () {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      access: { type: "string" },
      agent: { type: "string" },
      archetype: { type: "string" },
      category: { type: "string" },
      description: { type: "string" },
      discoveredBy: { type: "string" },
      domain: { type: "string" },
      id: { type: "string" },
      note: { type: "string" },
      origin: { type: "string" },
      spec: { type: "string" },
      status: { type: "string" },
      transport: { type: "string" },
      url: { type: "string" },
    },
  });

  const [command] = positionals;
  const svc = yield* SourceCatalogService;

  switch (command) {
    case "seed":
      return yield* svc.seed();
    case "claim":
      return yield* svc.claimWork(requireString(values.agent, "--agent"));
    case "list":
      return yield* svc.listCandidates({
        ...(values.category !== undefined && { category: values.category }),
        ...(values.archetype !== undefined && {
          archetype: values.archetype,
        }),
        ...(values.status !== undefined && { status: values.status }),
      });
    case "submit": {
      const archetypes = csv(values.archetype);
      if (archetypes === undefined || archetypes.length === 0) {
        return yield* Effect.fail(new Error("submit requires --archetype"));
      }
      const input = {
        archetypes,
        category: requireString(values.category, "--category"),
        domain: requireString(values.domain, "--domain"),
        url: requireString(values.url, "--url"),
        ...(values.access !== undefined && { access: values.access }),
        ...(values.transport !== undefined && {
          transport: values.transport,
        }),
        ...(values.description !== undefined && {
          description: values.description,
        }),
        ...(values.origin !== undefined && { origin: values.origin }),
        ...(values.discoveredBy !== undefined && {
          discoveredBy: values.discoveredBy,
        }),
      };
      return yield* svc.submitCandidate(input);
    }
    case "enrich": {
      const id = requireString(values.id, "--id");
      return yield* svc.enrichCandidate(id, {
        ...(values.access !== undefined && { access: values.access }),
        ...(values.transport !== undefined && {
          transport: values.transport,
        }),
        ...(values.description !== undefined && {
          description: values.description,
        }),
        ...(values.origin !== undefined && { origin: values.origin }),
        ...(values.archetype !== undefined && {
          archetype: values.archetype,
        }),
        ...(values.note !== undefined && { note: values.note }),
      });
    }
    case "promote": {
      const id = requireString(values.id, "--id");
      const spec = JSON.parse(requireString(values.spec, "--spec"));
      return yield* svc.promoteSource(id, spec);
    }
    default:
      return yield* Effect.fail(
        new Error(`unknown command: ${command ?? "(none)"}\n${usage}`)
      );
  }
});

await Effect.runPromise(
  main.pipe(
    Effect.provide(SourceCatalogProgramLayer),
    Effect.matchCause({
      onFailure: (cause) => {
        console.error(Cause.pretty(cause));
        process.exitCode = 1;
      },
      onSuccess: (value) => console.log(JSON.stringify(value, null, 2)),
    })
  )
);
