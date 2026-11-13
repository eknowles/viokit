import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { findUnknownNames, scanPacks } from "./vocabulary.js";

describe("vocabulary conformance", () => {
  it("passes the packs as they are", async () => {
    expect(await scanPacks()).toEqual([]);
  });

  it("flags an unknown entity kind with file, line and name", () => {
    const found = findUnknownNames(
      "p.ts",
      'a\nconst e = { kind: "hostname" };'
    );
    expect(found).toEqual([
      { file: "p.ts", line: 2, name: "hostname", what: "entity kind" },
    ]);
  });

  it("flags an unknown kind passed to the entity helpers", () => {
    const found = findUnknownNames(
      "p.ts",
      'entityOfKind("registrar", key, v);\nkeyOf("hostname", v);'
    );
    expect(found.map((f) => f.name)).toEqual(["registrar", "hostname"]);
    expect(found.map((f) => f.line)).toEqual([1, 2]);
  });

  it("flags an unknown relation type, including across lines", () => {
    const found = findUnknownNames(
      "p.ts",
      'linked(\n  domain,\n  address,\n  "pointing-at"\n)'
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe("pointing-at");
    expect(found[0]?.what).toBe("relation type");
  });

  it("does not flag known names or a tool classification", () => {
    const source =
      'kind: "domain", kind: "ip-address", kind: "passive", kind: "active", linked(a, b, "resolves-to")';
    expect(findUnknownNames("p.ts", source)).toEqual([]);
  });

  it("flags the violating fixture (the control)", async () => {
    const fixture = await readFile(
      "conformance/fixtures/vocab-violation.txt",
      "utf8"
    );
    const found = findUnknownNames("fixture", fixture);
    expect(found.map((f) => f.name).sort()).toEqual([
      "hostname",
      "pointing-at",
      "registrar",
    ]);
  });

  it("reports a name planted in a temporary pack directory", async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = await mkdtemp(join(tmpdir(), "vocab-"));
    try {
      await mkdir(join(root, "demo"));
      await writeFile(
        join(root, "demo", "manifest.ts"),
        'const x = { kind: "fqdn" };\n'
      );
      const found = await scanPacks(root);
      expect(found).toHaveLength(1);
      expect(found[0]?.name).toBe("fqdn");
      expect(found[0]?.line).toBe(1);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
