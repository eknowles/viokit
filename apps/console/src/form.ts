/**
 * Schema→form (TDR-008). Walks the Draft-2020-12 document `catalog_describe`
 * publishes and derives fields from it, so a transform becomes runnable in the
 * console the moment it is registered — no per-transform UI code.
 *
 * Deliberately covers the shapes the catalog actually publishes today: flat
 * objects of primitives and enums. Anything else falls back to raw JSON entry,
 * so an exotic schema makes the form less convenient rather than blocking the
 * transform. Validation here is advisory; the engine's boundary decode is what
 * decides (I6).
 */

export type FieldKind = "string" | "number" | "boolean" | "enum" | "json";

export interface Field {
  readonly description: string | undefined;
  readonly kind: FieldKind;
  readonly name: string;
  readonly options: readonly string[] | undefined;
  readonly required: boolean;
}

/** A derived form, or a fallback that takes the whole input as JSON. */
export type FormShape =
  | { readonly _tag: "fields"; readonly fields: readonly Field[] }
  | { readonly _tag: "raw"; readonly reason: string };

interface JsonSchema {
  readonly $defs?: Record<string, JsonSchema>;
  readonly $ref?: string;
  readonly description?: string;
  readonly enum?: readonly unknown[];
  readonly properties?: Record<string, JsonSchema>;
  readonly required?: readonly string[];
  readonly type?: string;
}

interface SchemaDocument {
  readonly definitions?: Record<string, JsonSchema>;
  readonly schema?: JsonSchema;
}

const DEF_PREFIX = /^#\/(?:\$defs|definitions)\//;

/** Documents reference shared definitions by `$ref`; resolve one level. */
const resolve = (
  schema: JsonSchema | undefined,
  definitions: Record<string, JsonSchema>
): JsonSchema | undefined => {
  if (schema?.$ref === undefined) {
    return schema;
  }
  const key = schema.$ref.replace(DEF_PREFIX, "");
  return definitions[key];
};

const kindOf = (schema: JsonSchema): FieldKind | undefined => {
  if (schema.enum !== undefined) {
    return "enum";
  }
  if (schema.type === "string") {
    return "string";
  }
  if (schema.type === "number" || schema.type === "integer") {
    return "number";
  }
  if (schema.type === "boolean") {
    return "boolean";
  }
};

export const formShapeOf = (document: unknown): FormShape => {
  const doc = document as SchemaDocument | undefined;
  const definitions = doc?.definitions ?? {};
  const root = resolve(doc?.schema, definitions);

  if (root === undefined) {
    return { _tag: "raw", reason: "no input contract published" };
  }
  if (root.type !== "object" || root.properties === undefined) {
    return { _tag: "raw", reason: "input is not an object of fields" };
  }

  const required = new Set(root.required ?? []);
  const fields: Field[] = [];

  for (const [name, rawProperty] of Object.entries(root.properties)) {
    const property = resolve(rawProperty, definitions);
    if (property === undefined) {
      return { _tag: "raw", reason: `field '${name}' could not be resolved` };
    }
    const kind = kindOf(property);
    if (kind === undefined) {
      return {
        _tag: "raw",
        reason: `field '${name}' has an unsupported shape`,
      };
    }
    fields.push({
      description: property.description,
      kind,
      name,
      options:
        kind === "enum"
          ? (property.enum ?? []).map((option) => String(option))
          : undefined,
      required: required.has(name),
    });
  }

  return { _tag: "fields", fields };
};

/** Coerce a form's string values into the types the contract declares. */
export const valuesToArgs = (
  fields: readonly Field[],
  values: Record<string, string>
): Record<string, unknown> => {
  const args: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.name];
    if (raw === undefined || raw === "") {
      continue;
    }
    if (field.kind === "number") {
      args[field.name] = Number(raw);
    } else if (field.kind === "boolean") {
      args[field.name] = raw === "true";
    } else {
      args[field.name] = raw;
    }
  }
  return args;
};
