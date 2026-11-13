import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  type Engine,
  EvidenceBackendMemory,
  makeEngineLayer,
  makeViewStateLayer,
  OntologyRegistryLayer,
} from "@viokit/engine";
import { manifest as webDns } from "@viokit/packs/web-dns/manifest";
import { SourceTransportService } from "@viokit/schema";
import { Effect, Layer } from "effect";
import { runCli } from "../src/cli.js";
import { makeAgentServer } from "../src/mcp.js";
import { findOperation } from "../src/operations.js";

/**
 * The tree operations through the shared front-ends. The transport is stubbed
 * with a certificate answer, so crt.sh is the one runnable transform (the
 * exec tools and the credentialed sources are not declared here, so they are
 * skipped with a reason, which is also checked).
 */

const transport = Layer.succeed(SourceTransportService, {
  fetch: () =>
    Effect.succeed({
      bytes: new TextEncoder().encode(
        '[{"name_value":"acme.test\\nwww.acme.test"}]'
      ),
      contentType: "application/json",
    }),
});

const deployment = () =>
  Layer.provide(
    makeEngineLayer([webDns]),
    Layer.mergeAll(
      transport,
      EvidenceBackendMemory,
      OntologyRegistryLayer,
      makeViewStateLayer(mkdtempSync(join(tmpdir(), "viokit-vs-")))
    )
  ) as Layer.Layer<Engine, unknown, never>;

const connect = async (layer: Layer.Layer<Engine, unknown, never>) => {
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

describe("tree operations", () => {
  it("are in the shared operation table", () => {
    expect(findOperation("tree_expand")).toBeDefined();
    expect(findOperation("tree_show")).toBeDefined();
  });

  it("expand a seed through the MCP surface and read the tree back", async () => {
    const client = await connect(deployment());
    const expanded = await call(client, "tree_expand", {
      seedKind: "domain",
      seedValue: "acme.test",
    });
    expect(expanded.isError).toBe(false);
    const summary = JSON.parse(expanded.text) as {
      entities: number;
      runs: number;
      skipped: { transformId: string; reason: string }[];
      stoppedBecause: string;
    };
    // acme.test and www.acme.test, and crt.sh run on each.
    expect(summary.entities).toBe(2);
    expect(summary.runs).toBe(2);
    expect(summary.stoppedBecause).toBe("exhausted");
    // The exec tools are not declared in this deployment: skipped, once, with why.
    const skipped = summary.skipped.map((one) => one.transformId);
    expect(skipped).toContain("dig-resolve");
    expect(skipped).toContain("nmap-open-ports");

    const shown = await call(client, "tree_show");
    expect(shown.isError).toBe(false);
    const roots = JSON.parse(shown.text) as {
      entityId: string;
      runs: { transformId: string; children: { entityId: string }[] }[];
    }[];
    expect(roots).toHaveLength(1);
    const [root] = roots;
    if (root === undefined) {
      throw new Error("the tree has no root");
    }
    expect(root.entityId).toBe("acme.test");
    const search = root.runs.find(
      (run) => run.transformId === "crt-sh-certificate-search"
    );
    expect(search?.children.map((child) => child.entityId)).toEqual([
      "www.acme.test",
    ]);
  });

  it("runs from the CLI as well", async () => {
    const code = await runCli(
      ["tree_expand", "--seedKind", "domain", "--seedValue", "acme.test"],
      deployment()
    );
    expect(code).toBe(0);
  });

  it("refuses a seed no transform accepts", async () => {
    const client = await connect(deployment());
    const outcome = await call(client, "tree_expand", {
      seedKind: "organization",
      seedValue: "Acme Ltd",
    });
    expect(outcome.isError).toBe(true);
    expect(outcome.text).toContain("no transform accepts");
  });
});
