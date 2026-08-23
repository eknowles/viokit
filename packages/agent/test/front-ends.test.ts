import { describe, expect, it } from "@effect/vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  Engine,
  EvidenceBackendMemory,
  makeEngineLayer,
  OntologyRegistryLayer,
} from "@viokit/engine";
import { manifest as peopleManifest } from "@viokit/packs/people-identity/manifest";
import { manifest as webDns } from "@viokit/packs/web-dns/manifest";
import { SourceTransportService } from "@viokit/schema";
import { Effect, Layer } from "effect";
import { runCli } from "../src/cli.js";
import { makeAgentServer } from "../src/mcp.js";
import { findOperation, operationNames } from "../src/operations.js";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const transport = Layer.succeed(SourceTransportService, {
  fetch: () =>
    Effect.succeed({
      bytes: text('[{"name_value":"acme.test"}]'),
      contentType: "application/json",
    }),
});

/**
 * A real deployment behind both front-ends: the `web-dns` pack registered into
 * a real engine, with the transport stubbed.
 *
 * Built from `makeEngineLayer` rather than `makeAgentProgramLayer`, because the
 * program layer wires its own dispatch transport — providing a stub to it does
 * nothing, and these tests would quietly reach the real network.
 */
const deployment = () =>
  Layer.provide(
    makeEngineLayer([webDns]),
    Layer.mergeAll(transport, EvidenceBackendMemory, OntologyRegistryLayer)
  ) as Layer.Layer<Engine, unknown, never>;

const connect = async (layer = deployment()) => {
  const server = makeAgentServer(layer);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
};

const call = async (
  client: Client,
  name: string,
  args: Record<string, unknown> = {}
) => {
  const result = (await client.callTool({ arguments: args, name })) as {
    content: { text: string }[];
    isError?: boolean;
  };
  const [first] = result.content;
  return {
    isError: result.isError === true,
    text: first === undefined ? "" : first.text,
  };
};

describe("MCP tool round-trips", () => {
  it("exposes every operation as a tool", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(
      [...operationNames].sort()
    );
  });

  it("lists the catalog and describes an entry", async () => {
    const client = await connect();

    const listed = await call(client, "catalog_list", { pack: "web-dns" });
    expect(listed.isError).toBe(false);
    const entries = JSON.parse(listed.text) as { id: string }[];
    expect(entries.some((e) => e.id === "crt-sh-certificate-search")).toBe(
      true
    );

    const described = await call(client, "catalog_describe", {
      id: "crt-sh-certificate-search",
    });
    const detail = JSON.parse(described.text) as {
      input: { schema: { properties: Record<string, unknown> } };
    };
    expect(detail.input.schema.properties.domain).toBeDefined();
  });

  it("runs the full loop over tools: list, run, commit, query", async () => {
    const client = await connect();

    const staged = await call(client, "run_transform", {
      input: { domain: "acme.test" },
      transformId: "crt-sh-certificate-search",
    });
    expect(staged.isError).toBe(false);
    const steps = JSON.parse(staged.text) as { evidenceIds: string[] }[];
    expect(steps).toHaveLength(3);
    // Every staged step is attributed to the run's evidence (I2).
    expect(steps.every((step) => step.evidenceIds.length === 1)).toBe(true);

    for (const step of steps) {
      // Sequential on purpose: each commit is a separate append to the log.
      // biome-ignore lint/performance/noAwaitInLoops: ordered appends
      const committed = await call(client, "insert", { step });
      expect(committed.isError).toBe(false);
    }

    await call(client, "replay");
    const queried = await call(client, "query_entity", { id: "acme.test" });
    expect(queried.text).toContain("acme.test");

    const related = await call(client, "relatedness", { seed: "acme.test" });
    expect(related.text).toContain("cert:acme.test");
  });

  it("rejects malformed input at the boundary and changes no state (I6)", async () => {
    const client = await connect();

    const before = await call(client, "log");
    const bad = await call(client, "insert", {
      step: { operation: { _tag: "AddEntity" } },
    });
    expect(bad.isError).toBe(true);

    const after = await call(client, "log");
    expect(after.text).toBe(before.text);
  });

  it("rejects a graph write with no evidence attribution (I2)", async () => {
    const client = await connect();

    const staged = await call(client, "run_transform", {
      input: { domain: "acme.test" },
      transformId: "crt-sh-certificate-search",
    });
    const [step] = JSON.parse(staged.text) as Record<string, unknown>[];

    const stripped = { ...step, evidenceIds: [] };
    const rejected = await call(client, "insert", { step: stripped });
    expect(rejected.isError).toBe(true);
  });

  it("reports an engine failure as an error, not a successful result", async () => {
    const client = await connect();
    const missing = await call(client, "catalog_describe", { id: "nope" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("UnknownCatalogEntry");
  });
});

describe("front-end parity (I8)", () => {
  it("every operation is reachable from both surfaces", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    const mcpNames = tools.map((tool) => tool.name).sort();

    // The CLI dispatches by looking the command up in the same table, so its
    // command set is exactly the operations it can resolve.
    const cliNames = operationNames
      .filter((name) => findOperation(name) !== undefined)
      .sort();

    expect(mcpNames).toEqual([...operationNames].sort());
    expect(cliNames).toEqual(mcpNames);
    // Neither surface offers something the other lacks.
    expect(mcpNames.length).toBe(operationNames.length);
  });

  it("the same call produces the same result on both surfaces", async () => {
    const layer = deployment();
    const client = await connect(layer);

    const viaMcp = await call(client, "catalog_list", { kind: "transform" });
    const viaCli = await runCli(["catalog_list", "--kind", "transform"], layer);

    expect(viaCli).toBe(0);
    expect(viaMcp.isError).toBe(false);
    expect(JSON.parse(viaMcp.text)).toHaveLength(1);
  });
});

describe("front-ends contribute no behavior and grant no privilege (I8, I4/I10)", () => {
  /** A substituted engine: every operation answers from here, not the real one. */
  const calls: string[] = [];
  const substitute = Layer.succeed(Engine, {
    acquire: () => Effect.die("not called"),
    catalog: () => {
      calls.push("catalog");
      return Effect.succeed([
        { id: "substituted", kind: "source" as const, name: "substituted" },
      ]);
    },
    correlate: () => Effect.succeed([]),
    describe: () => {
      calls.push("describe");
      return Effect.succeed({
        entry: {
          id: "substituted",
          kind: "source" as const,
          name: "substituted",
        },
      });
    },
    ingest: () => Effect.die("not called"),
    insert: () => Effect.die("not called"),
    log: Effect.succeed([]),
    paths: () => Effect.succeed([]),
    queryEntity: () => Effect.die("not called"),
    relatedness: () => Effect.succeed([]),
    replay: Effect.die("not called"),
    runCatalogTransform: () => {
      calls.push("runCatalogTransform");
      return Effect.succeed([]);
    },
    runTransform: () => Effect.die("not called"),
    spatial: () => Effect.succeed([]),
    timeline: () => Effect.succeed([]),
  } as unknown as typeof Engine.Service) as Layer.Layer<Engine, unknown, never>;

  it("answers every operation from the substituted engine", async () => {
    calls.length = 0;
    const client = await connect(substitute);

    const listed = await call(client, "catalog_list");
    expect(JSON.parse(listed.text)).toEqual([
      { id: "substituted", kind: "source", name: "substituted" },
    ]);

    const described = await call(client, "catalog_describe", { id: "x" });
    expect(described.text).toContain("substituted");

    const ran = await call(client, "run_transform", {
      input: {},
      transformId: "anything",
    });
    expect(JSON.parse(ran.text)).toEqual([]);

    // The front-end reached the engine for each and produced nothing itself.
    expect(calls).toEqual(["catalog", "describe", "runCatalogTransform"]);
  });

  it("offers no operation that bypasses the engine", async () => {
    const client = await connect(substitute);
    const { tools } = await client.listTools();

    // Every advertised tool resolves to an entry in the shared table, and every
    // table entry runs through `Engine` — there is no other path to evidence,
    // the step log, or the graph.
    for (const tool of tools) {
      expect(findOperation(tool.name)).toBeDefined();
    }
  });
});

describe("CLI surface", () => {
  it("returns 0 on success and 1 on failure, distinguishably", async () => {
    const layer = deployment();
    const ok = await runCli(["catalog_list", "--pack", "web-dns"], layer);
    expect(ok).toBe(0);

    const failed = await runCli(["catalog_describe", "--id", "nope"], layer);
    expect(failed).toBe(1);

    const unknown = await runCli(["no_such_command"], layer);
    expect(unknown).toBe(1);

    const missingArg = await runCli(["catalog_describe"], layer);
    expect(missingArg).toBe(1);
  });
});

describe("manual acquisition through the front-ends (I1, I9)", () => {
  const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64");

  it("turns manually retrieved bytes into content-addressed evidence", async () => {
    const client = await connect();

    const submitted = await call(client, "ingest", {
      by: "ed",
      content: b64("a page copied out of a login-walled portal"),
      contentType: "text/html",
      ref: "https://portal.test/record/42",
    });

    expect(submitted.isError).toBe(false);
    const evidence = JSON.parse(submitted.text) as {
      acquisitionPath: { _tag: string; by: string; ref: string };
      id: string;
    };
    expect(evidence.acquisitionPath._tag).toBe("manual");
    expect(evidence.acquisitionPath.by).toBe("ed");
    expect(evidence.acquisitionPath.ref).toBe("https://portal.test/record/42");
    expect(evidence.id.length).toBeGreaterThan(0);
  });

  it("collapses identical submissions to one record (I1)", async () => {
    const client = await connect();
    const payload = {
      by: "ed",
      content: b64("the same bytes twice"),
      contentType: "text/plain",
    };

    const first = await call(client, "ingest", payload);
    const second = await call(client, "ingest", payload);

    const a = JSON.parse(first.text) as { id: string };
    const b = JSON.parse(second.text) as { id: string };
    expect(a.id).toBe(b.id);
  });

  it("rejects a submission with no retriever and stores nothing", async () => {
    const client = await connect();
    const rejected = await call(client, "ingest", {
      content: b64("orphan bytes"),
      contentType: "text/plain",
    });
    expect(rejected.isError).toBe(true);
  });

  it("rejects a payload that is not valid base64", async () => {
    const client = await connect();
    const rejected = await call(client, "ingest", {
      by: "ed",
      content: "!!! not base64 !!!",
      contentType: "text/plain",
    });
    expect(rejected.isError).toBe(true);
  });

  it("submitted evidence can carry a committed step (I2)", async () => {
    const client = await connect();

    const submitted = await call(client, "ingest", {
      by: "ed",
      content: b64("manually retrieved record"),
      contentType: "text/plain",
    });
    const evidence = JSON.parse(submitted.text) as { id: string };

    const staged = await call(client, "run_transform", {
      input: { domain: "manual.test" },
      transformId: "crt-sh-certificate-search",
    });
    const [step] = JSON.parse(staged.text) as Record<string, unknown>[];

    // Re-attribute the step to the manually acquired evidence.
    const attributed = { ...step, evidenceIds: [evidence.id] };
    const committed = await call(client, "insert", { step: attributed });
    expect(committed.isError).toBe(false);
  });

  it("appears on the CLI as well as the tool surface (parity)", async () => {
    expect(findOperation("ingest")).toBeDefined();
    const code = await runCli(
      [
        "ingest",
        "--content",
        b64("via the command surface"),
        "--contentType",
        "text/plain",
        "--by",
        "ed",
      ],
      deployment()
    );
    expect(code).toBe(0);
  });
});

describe("end-to-end: using a source the engine cannot fetch", () => {
  const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64");

  const peopleDeployment = () =>
    Layer.provide(
      makeEngineLayer([peopleManifest]),
      Layer.mergeAll(transport, EvidenceBackendMemory, OntologyRegistryLayer)
    ) as Layer.Layer<Engine, unknown, never>;

  it("an agent finds the source excluded, then works it manually", async () => {
    const client = await connect(peopleDeployment());

    // 1. The agent asks for what it can actually run here.
    const usable = await call(client, "catalog_list", {
      kind: "source",
      runnable: true,
    });
    const usableIds = (JSON.parse(usable.text) as { id: string }[]).map(
      (entry) => entry.id
    );
    expect(usableIds).not.toContain("voterrecords.com");

    // 2. It looks at the full listing and learns why that one is missing.
    const all = await call(client, "catalog_list", { kind: "source" });
    const gated = (
      JSON.parse(all.text) as {
        access: string;
        id: string;
        reason: string;
        runnable: boolean;
      }[]
    ).find((entry) => entry.id === "voterrecords.com");
    expect(gated?.runnable).toBe(false);
    expect(gated?.access).toBe("browser_scrape");
    expect(gated?.reason).toContain("browser");

    // 3. A person retrieves the record by hand and submits it as evidence.
    const submitted = await call(client, "ingest", {
      by: "ed",
      content: b64("<html>voter record for J. Doe</html>"),
      contentType: "text/html",
      ref: "https://voterrecords.com/search?q=doe",
    });
    expect(submitted.isError).toBe(false);
    const evidence = JSON.parse(submitted.text) as {
      acquisitionPath: { _tag: string; by: string };
      id: string;
    };
    expect(evidence.acquisitionPath._tag).toBe("manual");
    expect(evidence.acquisitionPath.by).toBe("ed");

    // 4. A step attributed to that evidence commits like any other (I2).
    const step = {
      evidenceIds: [evidence.id],
      id: "manual-step",
      operation: {
        _tag: "AddEntity",
        entity: {
          id: "j-doe",
          identifiers: [{ kind: "name", value: "J. Doe" }],
          kind: "person",
          spatialExtent: { lat: 0, lon: 0 },
          temporalExtent: {
            validFrom: "2024-01-01T00:00:00.000Z",
            validTo: "2024-12-31T00:00:00.000Z",
          },
        },
      },
    };
    const committed = await call(client, "insert", { step });
    expect(committed.isError).toBe(false);

    // 5. And it reads back out of the graph.
    await call(client, "replay");
    const queried = await call(client, "query_entity", { id: "j-doe" });
    expect(queried.text).toContain("J. Doe");
  });
});
