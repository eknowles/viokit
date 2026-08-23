import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";
import {
  CatalogEntry,
  CatalogEntryDetail,
  CatalogFilter,
  PackManifest,
} from "../src/index.js";

describe("CatalogEntry decode (I6)", () => {
  it("decodes a source entry without archetype or description", () => {
    const entry = Schema.decodeUnknownSync(CatalogEntry)({
      id: "whois",
      kind: "source",
      name: "WHOIS",
      pack: "web-dns",
    });
    assert.strictEqual(entry.kind, "source");
    assert.strictEqual(entry.archetype, undefined);
    assert.strictEqual(entry.description, undefined);
  });

  it("decodes a transform entry carrying its archetype", () => {
    const entry = Schema.decodeUnknownSync(CatalogEntry)({
      archetype: "lookup",
      description: "Look a domain up in WHOIS",
      id: "whois-lookup",
      kind: "transform",
      name: "WHOIS lookup",
      pack: "web-dns",
    });
    assert.strictEqual(entry.archetype, "lookup");
  });

  it("decodes an ontology type entry with no pack", () => {
    const entry = Schema.decodeUnknownSync(CatalogEntry)({
      id: "Domain",
      kind: "type",
      name: "Domain",
    });
    assert.strictEqual(entry.pack, undefined);
  });

  it("rejects an unknown kind", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(CatalogEntry)({
        id: "x",
        kind: "pack",
        name: "x",
      })
    );
  });

  it("rejects an entry missing its identity", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(CatalogEntry)({ kind: "source", name: "x" })
    );
  });

  it("rejects an archetype outside the declared set", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(CatalogEntry)({
        archetype: "teleport",
        id: "x",
        kind: "transform",
        name: "x",
      })
    );
  });
});

describe("CatalogFilter decode (I6)", () => {
  it("decodes an empty filter — no field constrains", () => {
    const filter = Schema.decodeUnknownSync(CatalogFilter)({});
    assert.strictEqual(filter.kind, undefined);
    assert.strictEqual(filter.pack, undefined);
    assert.strictEqual(filter.archetype, undefined);
  });

  it("rejects a filter kind outside the declared set", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(CatalogFilter)({ kind: "everything" })
    );
  });
});

describe("CatalogEntryDetail decode (I6)", () => {
  it("carries JSON Schema documents for input and output", () => {
    const detail = Schema.decodeUnknownSync(CatalogEntryDetail)({
      entry: {
        archetype: "lookup",
        id: "whois-lookup",
        kind: "transform",
        name: "WHOIS lookup",
        pack: "web-dns",
      },
      input: {
        properties: { domain: { type: "string" } },
        required: ["domain"],
        type: "object",
      },
      output: { type: "object" },
    });
    assert.strictEqual(detail.entry.id, "whois-lookup");
    assert.deepStrictEqual(detail.output, { type: "object" });
    assert.strictEqual(detail.schemaGap, undefined);
  });

  it("decodes a detail that degrades to no documents, carrying the gap", () => {
    const detail = Schema.decodeUnknownSync(CatalogEntryDetail)({
      entry: { id: "Domain", kind: "type", name: "Domain" },
      schemaGap: "registered input is not a schema",
    });
    assert.strictEqual(detail.input, undefined);
    assert.strictEqual(detail.schemaGap, "registered input is not a schema");
  });

  it("rejects a non-JSON input document", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(CatalogEntryDetail)({
        entry: { id: "x", kind: "source", name: "x" },
        input: () => "not json",
      })
    );
  });
});

describe("PackManifest decode (I6)", () => {
  const source = {
    id: "whois",
    transport: "http",
    url: "https://whois.example",
  };

  it("decodes a manifest of sources with no transforms", () => {
    const manifest = Schema.decodeUnknownSync(PackManifest)({
      pack: "web-dns",
      sources: [source],
      transforms: [],
    });
    assert.strictEqual(manifest.pack, "web-dns");
    assert.strictEqual(manifest.sources.length, 1);
    assert.strictEqual(manifest.sources[0]?.url, "https://whois.example");
  });

  it("decodes a registered transform carrying its bound projection", () => {
    const project = () => [];
    const manifest = Schema.decodeUnknownSync(PackManifest)({
      pack: "web-dns",
      sources: [source],
      transforms: [
        {
          project,
          source,
          spec: {
            archetype: "lookup",
            id: "whois-lookup",
            input: Schema.Struct({ domain: Schema.String }),
            output: Schema.Struct({ registrar: Schema.String }),
            projection: "steps",
            sourceId: "whois",
          },
        },
      ],
    });
    assert.strictEqual(manifest.transforms[0]?.spec.id, "whois-lookup");
    assert.strictEqual(manifest.transforms[0]?.project, project);
  });

  it("rejects a manifest whose source is not a valid SourceSpec", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(PackManifest)({
        pack: "web-dns",
        sources: [{ id: "whois", transport: "carrier-pigeon", url: "x" }],
        transforms: [],
      })
    );
  });

  it("rejects a manifest missing its pack slug", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(PackManifest)({
        sources: [source],
        transforms: [],
      })
    );
  });
});
