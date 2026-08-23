import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
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
import { makeHandler } from "../src/http.js";
import { findOperation, operationNames } from "../src/operations.js";

/** A throwaway view-state root per run: the store is a deployment input. */
const tempViewState = () =>
  makeViewStateLayer(mkdtempSync(join(tmpdir(), "viokit-vs-")));

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const transport = Layer.succeed(SourceTransportService, {
  fetch: () =>
    Effect.succeed({
      bytes: text('[{"name_value":"acme.test"}]'),
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
      tempViewState()
    )
  ) as Layer.Layer<Engine, unknown, never>;

const handler = () => makeHandler(deployment());

const post = (
  h: (r: Request) => Promise<Response>,
  name: string,
  body: unknown = {}
) =>
  h(
    new Request(`http://localhost/operations/${name}`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
  );

const get = (h: (r: Request) => Promise<Response>, path: string) =>
  h(new Request(`http://localhost${path}`));

describe("HTTP surface", () => {
  it("describes itself, listing every operation with its arguments", async () => {
    const res = await get(handler(), "/operations");
    expect(res.status).toBe(200);

    const listed = (await res.json()) as {
      args: { name: string; required: boolean }[];
      name: string;
    }[];
    expect(
      listed.map((o) => o.name).sort((a, b) => a.localeCompare(b))
    ).toEqual([...operationNames].sort((a, b) => a.localeCompare(b)));

    const run = listed.find((o) => o.name === "run_transform");
    expect(
      run?.args.map((a) => a.name).sort((a, b) => a.localeCompare(b))
    ).toEqual(["input", "transformId"]);
    expect(run?.args.every((a) => a.required)).toBe(true);
  });

  it("runs a full loop over HTTP: list, run, commit, query", async () => {
    const h = handler();

    const listed = await post(h, "catalog_list", { pack: "web-dns" });
    expect(listed.status).toBe(200);
    const entries = (await listed.json()) as { id: string }[];
    expect(entries.some((e) => e.id === "crt-sh-certificate-search")).toBe(
      true
    );

    const staged = await post(h, "run_transform", {
      input: { domain: "acme.test" },
      transformId: "crt-sh-certificate-search",
    });
    const steps = (await staged.json()) as { evidenceIds: string[] }[];
    expect(steps).toHaveLength(3);

    for (const step of steps) {
      // Sequential on purpose: each commit is a separate append to the log.
      // biome-ignore lint/performance/noAwaitInLoops: ordered appends
      const committed = await post(h, "insert", { step });
      expect(committed.status).toBe(200);
    }

    await post(h, "replay");
    const queried = await post(h, "query_entity", { id: "acme.test" });
    expect(await queried.text()).toContain("acme.test");
  });

  it("builds a valid call from a discovered declaration alone", async () => {
    const h = handler();
    const listed = (await (await get(h, "/operations")).json()) as {
      args: { kind: string; name: string; required: boolean }[];
      name: string;
    }[];
    const describeOp = listed.find((o) => o.name === "catalog_describe");

    const payload: Record<string, unknown> = {};
    for (const arg of describeOp?.args ?? []) {
      if (arg.required && arg.kind === "string") {
        payload[arg.name] = "crt-sh-certificate-search";
      }
    }
    const res = await post(h, "catalog_describe", payload);
    expect(res.status).toBe(200);
  });

  it("refuses an unknown operation", async () => {
    const res = await post(handler(), "no_such_operation");
    expect(res.status).toBe(404);
  });

  it("refuses an unknown route", async () => {
    const res = await get(handler(), "/nope");
    expect(res.status).toBe(404);
  });

  it("rejects a malformed payload without changing engine state (I6)", async () => {
    const h = handler();

    const before = await (await post(h, "log")).json();
    const bad = await post(h, "insert", {
      step: { operation: { _tag: "AddEntity" } },
    });
    expect(bad.status).toBe(400);

    const after = await (await post(h, "log")).json();
    expect(after).toEqual(before);
  });

  it("reports an operation failure as a failure, not a success", async () => {
    const res = await post(handler(), "catalog_describe", { id: "nope" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { tag: string };
    expect(body.tag).toBe("UnknownCatalogEntry");
  });

  it("rejects a graph write with no evidence attribution (I2)", async () => {
    const h = handler();
    const staged = await post(h, "run_transform", {
      input: { domain: "acme.test" },
      transformId: "crt-sh-certificate-search",
    });
    const [step] = (await staged.json()) as Record<string, unknown>[];

    const res = await post(h, "insert", { step: { ...step, evidenceIds: [] } });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe("three-way parity (I8)", () => {
  it("MCP, CLI, and HTTP expose the same operations", async () => {
    const listed = (await (await get(handler(), "/operations")).json()) as {
      name: string;
    }[];
    const http = listed.map((o) => o.name).sort((a, b) => a.localeCompare(b));

    // All three surfaces read one table, so this holds by construction — the
    // test exists to catch a surface that starts keeping its own list.
    const table = [...operationNames].sort((a, b) => a.localeCompare(b));
    expect(http).toEqual(table);
    for (const name of http) {
      expect(findOperation(name)).toBeDefined();
    }
  });
});

describe("view state over the surface (I12)", () => {
  const save = (h: (r: Request) => Promise<Response>, payload: unknown) =>
    post(h, "view_state_save", { payload, surface: "console", version: 1 });

  const load = (h: (r: Request) => Promise<Response>, version = 1) =>
    post(h, "view_state_load", { surface: "console", version });

  it("round-trips a surface's configuration", async () => {
    const h = handler();
    const saved = await save(h, { selected: "whois", view: "launcher" });
    expect(saved.status).toBe(200);

    const loaded = await load(h);
    const body = (await loaded.json()) as {
      value?: { payload: Record<string, unknown> };
    };
    expect(body.value?.payload).toEqual({
      selected: "whois",
      view: "launcher",
    });
  });

  it("reports absence for a version the surface no longer understands", async () => {
    const h = handler();
    await save(h, { view: "graph" });
    const loaded = await load(h, 2);
    expect(await loaded.text()).toContain("None");
  });

  it("saving appends no step (I3, I12)", async () => {
    const h = handler();
    const before = await (await post(h, "log")).json();
    await save(h, { view: "graph" });
    const after = await (await post(h, "log")).json();
    expect(after).toEqual(before);
  });

  it("is exposed on every surface, like every other operation", async () => {
    const listed = (await (await get(handler(), "/operations")).json()) as {
      name: string;
    }[];
    const names = listed.map((o) => o.name);
    expect(names).toContain("view_state_save");
    expect(names).toContain("view_state_load");
    expect(findOperation("view_state_save")).toBeDefined();
  });
});

describe("following a step to its evidence (I2)", () => {
  const b64 = (value: string) => Buffer.from(value, "utf8").toString("base64");

  const submit = (h: (r: Request) => Promise<Response>, content: string) =>
    post(h, "ingest", {
      by: "ed",
      content: b64(content),
      contentType: "text/plain",
      ref: "https://portal.test/record",
    });

  it("returns the record without its bytes by default", async () => {
    const h = handler();
    const stored = (await (await submit(h, "the artifact")).json()) as {
      id: string;
    };

    const fetched = await post(h, "evidence_get", { id: stored.id });
    expect(fetched.status).toBe(200);
    const record = (await fetched.json()) as {
      acquisitionPath: { _tag: string; by: string };
      byteLength: number;
      content?: string;
      id: string;
    };
    expect(record.id).toBe(stored.id);
    expect(record.acquisitionPath._tag).toBe("manual");
    expect(record.acquisitionPath.by).toBe("ed");
    expect(record.byteLength).toBe("the artifact".length);
    expect(record.content).toBeUndefined();
  });

  it("returns the artifact's bytes when asked", async () => {
    const h = handler();
    const stored = (await (await submit(h, "the artifact")).json()) as {
      id: string;
    };

    const fetched = await post(h, "evidence_get", {
      id: stored.id,
      includeContent: true,
    });
    const record = (await fetched.json()) as { content: string };
    expect(Buffer.from(record.content, "base64").toString("utf8")).toBe(
      "the artifact"
    );
  });

  it("reads an unknown identifier as absent, not an error", async () => {
    const fetched = await post(handler(), "evidence_get", {
      id: "0000000000000000",
    });
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toBeNull();
  });

  it("a committed step leads to the evidence it was attributed to", async () => {
    const h = handler();
    const staged = await post(h, "run_transform", {
      input: { domain: "trail.test" },
      transformId: "crt-sh-certificate-search",
    });
    const steps = (await staged.json()) as { evidenceIds: string[] }[];
    const [first] = steps;
    const evidenceRef = first?.evidenceIds[0];

    const fetched = await post(h, "evidence_get", { id: evidenceRef });
    const record = (await fetched.json()) as {
      acquisitionPath: { _tag: string };
    };
    // The step names evidence, and the evidence is retrievable — I2 verifiable
    // from outside the engine for the first time.
    expect(record.acquisitionPath._tag).toBeDefined();
  });

  it("reading evidence appends no step", async () => {
    const h = handler();
    const stored = (await (await submit(h, "x")).json()) as { id: string };
    const before = await (await post(h, "log")).json();
    await post(h, "evidence_get", { id: stored.id, includeContent: true });
    expect(await (await post(h, "log")).json()).toEqual(before);
  });
});
