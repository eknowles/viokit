import { Schema } from "effect";
import { SourceSpec, TransformArchetype, TransformSpec } from "./schemas.js";

/**
 * The runtime catalog: what a *running deployment* can do, as opposed to
 * `catalog.ts`, which is the discovery harness's store of candidate sources
 * not yet promoted. Entries here are derived from registered packs plus the
 * ontology registry; nothing is persisted (the catalog is a projection, and
 * catalog reads never touch the step log — I3).
 */

/** What a catalog entry describes. */
export const CatalogEntryKind = Schema.Literals([
  "source",
  "transform",
  "type",
]);
export type CatalogEntryKind = typeof CatalogEntryKind.Type;

/**
 * One listable capability. `pack` is absent for ontology types, which are
 * registered at runtime rather than carried by a pack; `archetype` is present
 * only for transforms.
 */
export class CatalogEntry extends Schema.Class<CatalogEntry>("CatalogEntry")({
  archetype: Schema.optionalKey(TransformArchetype),
  description: Schema.optionalKey(Schema.String),
  id: Schema.String,
  kind: CatalogEntryKind,
  name: Schema.String,
  pack: Schema.optionalKey(Schema.String),
}) {}

/**
 * A `list` filter. Every supplied field must match; an absent field does not
 * constrain. An empty result is a valid answer, never an error.
 */
export class CatalogFilter extends Schema.Class<CatalogFilter>("CatalogFilter")(
  {
    archetype: Schema.optionalKey(TransformArchetype),
    kind: Schema.optionalKey(CatalogEntryKind),
    pack: Schema.optionalKey(Schema.String),
  }
) {}

/**
 * A `describe` result: the entry plus its invocation contract as JSON Schema
 * documents (Draft 2020-12, produced by `Schema.toJsonSchemaDocument`, so the
 * contract is a conversion of the schema that actually decodes — I6).
 *
 * `schemaGap` explains why a document is absent: a `TransformSpec` carries its
 * input/output in `Schema.Any`-typed fields, so a manifest can register a value
 * that is not a schema at all, and conversion then throws a defect. Describe
 * degrades to an entry without documents rather than failing the call.
 */
export class CatalogEntryDetail extends Schema.Class<CatalogEntryDetail>(
  "CatalogEntryDetail"
)({
  entry: CatalogEntry,
  input: Schema.optionalKey(Schema.Json),
  output: Schema.optionalKey(Schema.Json),
  schemaGap: Schema.optionalKey(Schema.String),
}) {}

/**
 * A transform as a pack registers it: the spec, the source it acquires
 * through, and the projection bound alongside them. The projection is a
 * function, so it cannot cross a front-end boundary — which is precisely why
 * it is registered here and transforms are invoked by id (see
 * `Catalog.runTransform`) rather than by passing a callback.
 */
export class RegisteredTransform extends Schema.Class<RegisteredTransform>(
  "RegisteredTransform"
)({
  project: Schema.Any,
  source: SourceSpec,
  spec: TransformSpec,
}) {}

/**
 * A pack's contribution to the catalog. Registration is explicit: pack files
 * that no manifest names stay invisible to the catalog.
 */
export class PackManifest extends Schema.Class<PackManifest>("PackManifest")({
  pack: Schema.String,
  sources: Schema.Array(SourceSpec),
  transforms: Schema.Array(RegisteredTransform),
}) {}

export class UnknownCatalogEntry extends Schema.TaggedErrorClass<UnknownCatalogEntry>()(
  "UnknownCatalogEntry",
  {
    message: Schema.String,
  }
) {}

export class PackRegistrationError extends Schema.TaggedErrorClass<PackRegistrationError>()(
  "PackRegistrationError",
  {
    message: Schema.String,
  }
) {}
