import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Effect, Layer } from "effect";
import { SourceCatalogLayer, SourceCatalogService } from "../src/catalog.js";
import { makeSourceCatalogServer } from "../src/mcp.js";
import { PromoterService } from "../src/seams.js";
import { makeSourceCatalogSqliteLayerFor } from "../src/sqlite.js";

interface Writer {
  category: string;
  source: unknown;
  sourceId: string;
}

const makeFixture = async () => {
  const dir = mkdtempSync(join(tmpdir(), "viokit-mcp-"));
  const writes: Writer[] = [];
  const layer = SourceCatalogLayer.pipe(
    Layer.provide(
      Layer.succeed(PromoterService, {
        writeSource: (category, sourceId, source) =>
          Effect.sync(() => {
            writes.push({ category, source, sourceId });
          }),
      })
    ),
    Layer.provide(makeSourceCatalogSqliteLayerFor(join(dir, "catalog.db")))
  );

  const server = makeSourceCatalogServer(layer);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const run = <A, E>(effect: Effect.Effect<A, E, SourceCatalogService>) =>
    Effect.runPromise(effect.pipe(Effect.provide(layer)));

  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
      rmSync(dir, { force: true, recursive: true });
    },
    run,
    writes,
  };
};

type Fixture = Awaited<ReturnType<typeof makeFixture>>;

const callText = async (
  fixture: Fixture,
  name: string,
  args: Record<string, unknown>
): Promise<string> => {
  const result = await fixture.client.callTool({ arguments: args, name });
  const content = result.content as Array<{ type: string; text?: string }>;
  return content[0]?.text ?? "";
};

const validSubmit = (overrides: Record<string, unknown> = {}) => ({
  access: "open_api",
  archetypes: ["router"],
  category: "network",
  domain: "mcp.test",
  transport: "dataset",
  url: "https://mcp.test",
  ...overrides,
});

describe("MCP tool round-trips (R5)", () => {
  it("submit_candidate persists and list_candidates returns it", async () => {
    const fixture = await makeFixture();
    try {
      const submitText = await callText(
        fixture,
        "submit_candidate",
        validSubmit()
      );
      const submitted = JSON.parse(submitText) as {
        id: string;
        status: string;
      };
      expect(submitted.id).toBeDefined();
      expect(submitted.status).toBe("new");

      const listText = await callText(fixture, "list_candidates", {
        status: "new",
      });
      const listed = JSON.parse(listText) as Array<{ id: string }>;
      expect(listed.some((c) => c.id === submitted.id)).toBe(true);
    } finally {
      await fixture.close();
    }
  });

  it("enrich_candidate fills unset classification fields", async () => {
    const fixture = await makeFixture();
    try {
      const submitText = await callText(fixture, "submit_candidate", {
        access: "open_api",
        archetypes: ["router"],
        category: "network",
        domain: "mcp.test",
        url: "https://mcp.test",
      });
      const submitted = JSON.parse(submitText) as { id: string };

      const enrichText = await callText(fixture, "enrich_candidate", {
        description: "network device index",
        id: submitted.id,
        note: "verified",
        transport: "http",
      });
      const enriched = JSON.parse(enrichText) as {
        id: string;
        transport: string;
        description: string;
        note?: string;
      };
      expect(enriched.id).toBe(submitted.id);
      expect(enriched.transport).toBe("http");
      expect(enriched.description).toBe("network device index");
    } finally {
      await fixture.close();
    }
  });

  it("claim_work hands a leased unit to the requesting agent", async () => {
    const fixture = await makeFixture();
    try {
      await fixture.run(
        Effect.gen(function* () {
          const svc = yield* SourceCatalogService;
          yield* svc.seed();
        })
      );
      const claimText = await callText(fixture, "claim_work", {
        agent: "agent-x",
      });
      const claimed = JSON.parse(claimText) as {
        value?: { id: string; claimedBy: string };
      };
      expect(claimed.value?.id).toBeDefined();
      expect(claimed.value?.claimedBy).toBe("agent-x");
    } finally {
      await fixture.close();
    }
  });

  it("promote_source writes a pack entry and marks the candidate promoted", async () => {
    const fixture = await makeFixture();
    try {
      const submitText = await callText(
        fixture,
        "submit_candidate",
        validSubmit()
      );
      const submitted = JSON.parse(submitText) as { id: string };

      const promoteText = await callText(fixture, "promote_source", {
        id: submitted.id,
        spec: {
          category: "network",
          domain: "mcp.test",
          name: "mcp",
          url: "https://mcp.test",
        },
      });
      const promoted = JSON.parse(promoteText) as {
        id: string;
        status: string;
      };
      expect(promoted.id).toBe(submitted.id);
      expect(promoted.status).toBe("promoted");
      expect(fixture.writes).toHaveLength(1);
      expect(fixture.writes[0]?.sourceId).toBe("mcp.test");
      expect(fixture.writes[0]?.category).toBe("network");
    } finally {
      await fixture.close();
    }
  });

  it("rejects invalid payloads at the boundary (I6)", async () => {
    const fixture = await makeFixture();
    try {
      const badText = await callText(fixture, "submit_candidate", {
        ...validSubmit(),
        access: "not-a-valid-access",
      });
      expect(badText).toContain("error:");
    } finally {
      await fixture.close();
    }
  });
});
