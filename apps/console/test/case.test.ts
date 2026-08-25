import { describe, expect, it } from "vitest";
import {
  type CaseNode,
  entityNode,
  expansionsFor,
  isRealised,
  newEntities,
  seedNode,
  type TransformContract,
} from "../src/case.js";
import type { Field, FormShape } from "../src/form.js";
import type { GraphEntity, GraphSnapshot } from "../src/graph-layout.js";

const field = (name: string, overrides: Partial<Field> = {}): Field => ({
  description: undefined,
  kind: "string",
  name,
  options: undefined,
  required: true,
  ...overrides,
});

const fields = (...names: readonly Field[]): FormShape => ({
  _tag: "fields",
  fields: names,
});

const contract = (id: string, shape: FormShape): TransformContract => ({
  id,
  shape,
});

const entity = (
  id: string,
  kind: string,
  identifiers: readonly { kind: string; value: string }[] = []
): GraphEntity => ({
  id,
  identifiers,
  kind,
  temporalExtent: { validFrom: "1970-01-01", validTo: "9999-12-31" },
});

const snapshot = (entities: readonly GraphEntity[]): GraphSnapshot => ({
  entities,
  relations: [],
});

describe("seeding", () => {
  it("keeps a seed off the graph and says which value it stands for", () => {
    const seed = seedNode("  acme-intel.example  ");
    expect(seed.origin).toBe("seed");
    expect(seed.label).toBe("acme-intel.example");
    // No declared kind means no identifier to match on — the seed claims
    // nothing about what it is.
    expect(seed.identifiers).toEqual([]);
    expect(seed.kind).toBe("unknown");
  });

  it("carries a declared kind through as an identifier", () => {
    expect(seedNode("acme.example", "domain").identifiers).toEqual([
      { kind: "domain", value: "acme.example" },
    ]);
  });

  it("is realised once the graph asserts the value, by id or identifier", () => {
    const seed = seedNode("acme.example");
    expect(isRealised(seed, snapshot([]))).toBe(false);
    expect(isRealised(seed, snapshot([entity("acme.example", "domain")]))).toBe(
      true
    );
    expect(
      isRealised(
        seed,
        snapshot([
          entity("e1", "domain", [{ kind: "domain", value: "acme.example" }]),
        ])
      )
    ).toBe(true);
  });

  it("is not realised by an entity that merely mentions something else", () => {
    expect(
      isRealised(
        seedNode("acme.example"),
        snapshot([entity("other", "domain")])
      )
    ).toBe(false);
  });
});

describe("expansions", () => {
  const domain: CaseNode = entityNode(
    entity("acme.example", "domain", [
      { kind: "domain", value: "acme.example" },
    ])
  );

  it("matches a field to an identifier of the same name, and prefills it", () => {
    const [found] = expansionsFor(domain, [
      contract("crt-sh", fields(field("domain"))),
    ]);
    expect(found?.fit).toBe("exact");
    expect(found?.fill).toEqual({ domain: "acme.example" });
  });

  it("matches on the entity kind when no identifier is named for the field", () => {
    const bare: CaseNode = entityNode(entity("acme.example", "domain"));
    const [found] = expansionsFor(bare, [
      contract("crt-sh", fields(field("domain"))),
    ]);
    expect(found?.fit).toBe("exact");
    expect(found?.fill).toEqual({ domain: "acme.example" });
  });

  it("offers a single-field near miss as a suggestion, not a match", () => {
    // `hostname` means `domain` to a person and nothing to this console.
    const [found] = expansionsFor(domain, [
      contract("securitytrails", fields(field("hostname"))),
    ]);
    expect(found?.fit).toBe("possible");
    expect(found?.fill).toEqual({ hostname: "acme.example" });
    expect(found?.reason).toContain("check it before running");
  });

  it("refuses to guess when two unmatched required strings compete", () => {
    expect(
      expansionsFor(domain, [
        contract("paths", fields(field("from"), field("to"))),
      ])
    ).toEqual([]);
  });

  it("still matches when only some required fields line up by name", () => {
    const [found] = expansionsFor(domain, [
      contract("mixed", fields(field("domain"), field("registrar"))),
    ]);
    expect(found?.fit).toBe("exact");
    // Only the field it can honestly fill is filled.
    expect(found?.fill).toEqual({ domain: "acme.example" });
  });

  it("ignores optional and non-string fields when deciding what is needed", () => {
    expect(
      expansionsFor(domain, [
        contract("depth-only", fields(field("maxDepth", { kind: "number" }))),
      ])
    ).toEqual([]);
  });

  it("omits a transform whose contract could not be derived", () => {
    expect(
      expansionsFor(domain, [
        contract("exotic", { _tag: "raw", reason: "unsupported shape" }),
      ])
    ).toEqual([]);
  });

  it("puts exact fits first, then orders stably by id", () => {
    const found = expansionsFor(domain, [
      contract("z-exact", fields(field("domain"))),
      contract("a-possible", fields(field("hostname"))),
      contract("a-exact", fields(field("domain"))),
    ]);
    expect(found.map((one) => one.transformId)).toEqual([
      "a-exact",
      "z-exact",
      "a-possible",
    ]);
  });

  it("expands a seed that declared its kind exactly like a real node", () => {
    const [found] = expansionsFor(seedNode("acme.example", "domain"), [
      contract("crt-sh", fields(field("domain"))),
    ]);
    expect(found?.fit).toBe("exact");
  });

  it("expands an untyped seed as a suggestion — it has claimed nothing", () => {
    const [found] = expansionsFor(seedNode("acme.example"), [
      contract("crt-sh", fields(field("domain"))),
    ]);
    expect(found?.fit).toBe("possible");
    expect(found?.fill).toEqual({ domain: "acme.example" });
  });
});

describe("what an expansion produced", () => {
  it("counts only entities the graph did not already hold", () => {
    const before = snapshot([entity("a", "domain")]);
    const after = snapshot([
      entity("a", "domain"),
      entity("b", "domain"),
      entity("c", "ip-address"),
    ]);
    expect(newEntities(before, after).map((one) => one.id)).toEqual(["b", "c"]);
  });

  it("reports nothing when a transform only returned what was known", () => {
    const same = snapshot([entity("a", "domain")]);
    expect(newEntities(same, same)).toEqual([]);
  });
});
