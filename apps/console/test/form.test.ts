import { assert, describe, it } from "vitest";
import { formShapeOf, valuesToArgs } from "../src/form.js";

/**
 * Documents in the shape `catalog_describe` actually publishes — a `$ref` into
 * `definitions` for a class-backed schema, and an inline object for a struct.
 */
const inlineStruct = {
  definitions: {},
  dialect: "draft-2020-12",
  schema: {
    additionalProperties: false,
    properties: {
      depth: { description: "how far to walk", type: "number" },
      domain: { description: "the domain to look up", type: "string" },
    },
    required: ["domain"],
    type: "object",
  },
};

describe("deriving a form from a published contract", () => {
  it("derives fields, marking required and optional", () => {
    const shape = formShapeOf(inlineStruct);
    assert.strictEqual(shape._tag, "fields");
    if (shape._tag !== "fields") {
      return;
    }
    const byName = new Map(shape.fields.map((f) => [f.name, f]));
    assert.strictEqual(byName.get("domain")?.required, true);
    assert.strictEqual(byName.get("domain")?.kind, "string");
    assert.strictEqual(byName.get("depth")?.required, false);
    assert.strictEqual(byName.get("depth")?.kind, "number");
    assert.strictEqual(
      byName.get("domain")?.description,
      "the domain to look up"
    );
  });

  it("resolves a $ref into definitions", () => {
    const shape = formShapeOf({
      definitions: {
        Input: {
          properties: { id: { type: "string" } },
          required: ["id"],
          type: "object",
        },
      },
      schema: { $ref: "#/$defs/Input" },
    });
    assert.strictEqual(shape._tag, "fields");
    if (shape._tag === "fields") {
      assert.strictEqual(shape.fields[0]?.name, "id");
    }
  });

  it("treats a literal union as an enum with its options", () => {
    const shape = formShapeOf({
      schema: {
        properties: {
          transport: { enum: ["http", "dataset"], type: "string" },
        },
        required: ["transport"],
        type: "object",
      },
    });
    assert.strictEqual(shape._tag, "fields");
    if (shape._tag === "fields") {
      assert.strictEqual(shape.fields[0]?.kind, "enum");
      assert.deepStrictEqual(shape.fields[0]?.options, ["http", "dataset"]);
    }
  });

  it("falls back to raw entry for a nested object rather than blocking", () => {
    const shape = formShapeOf({
      schema: {
        properties: { bbox: { properties: {}, type: "object" } },
        type: "object",
      },
    });
    assert.strictEqual(shape._tag, "raw");
    if (shape._tag === "raw") {
      assert.include(shape.reason, "bbox");
    }
  });

  it("falls back when there is no contract at all", () => {
    assert.strictEqual(formShapeOf(undefined)._tag, "raw");
    assert.strictEqual(formShapeOf({})._tag, "raw");
  });

  it("falls back when the input is not an object of fields", () => {
    const shape = formShapeOf({ schema: { type: "string" } });
    assert.strictEqual(shape._tag, "raw");
  });
});

describe("coercing form values to the declared types", () => {
  const shape = formShapeOf(inlineStruct);
  const fields = shape._tag === "fields" ? shape.fields : [];

  it("coerces numbers and leaves strings alone", () => {
    assert.deepStrictEqual(
      valuesToArgs(fields, { depth: "3", domain: "acme.test" }),
      {
        depth: 3,
        domain: "acme.test",
      }
    );
  });

  it("omits blank optional values rather than sending empty strings", () => {
    assert.deepStrictEqual(
      valuesToArgs(fields, { depth: "", domain: "acme.test" }),
      {
        domain: "acme.test",
      }
    );
  });
});
