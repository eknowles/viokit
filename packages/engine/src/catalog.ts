import type {
  Catalog,
  CatalogFilter,
  PackManifest as PackManifestType,
  RegisteredTransform as RegisteredTransformType,
  SourceSpec,
  Step,
  TransformError,
  TransportKind,
} from "@viokit/schema";
import {
  CatalogEntry,
  CatalogEntryDetail,
  CatalogService,
  defaultTransportCapabilities,
  PackManifest,
  PackRegistrationError,
  PackRegistry,
  runnabilityOf,
  SourceSpec as SourceSpecSchema,
  TransformRunnerService,
  TransportCapabilities,
  UnknownCatalogEntry,
} from "@viokit/schema";
import { Effect, Layer, Option, Schema } from "effect";
import { OntologyRegistryService } from "./ontology.js";

/**
 * The runtime catalog: what this deployment can do, folded from the pack
 * manifests registered with it plus the ontology registry. It is a derived
 * projection — nothing here is persisted, and no catalog operation appends a
 * step or writes evidence (I3).
 *
 * Sources and transforms are fixed at construction (registration is explicit —
 * a pack file no manifest names stays invisible). Ontology types are read live
 * on every call, because packs register types at runtime after the layer is
 * built.
 */

interface Registered {
  readonly sourcePack: ReadonlyMap<string, string>;
  readonly sources: ReadonlyMap<string, SourceSpec>;
  readonly transformPack: ReadonlyMap<string, string>;
  readonly transforms: ReadonlyMap<string, RegisteredTransformType>;
}

const registrationError = (cause: unknown): PackRegistrationError =>
  PackRegistrationError.make({
    message: cause instanceof Error ? cause.message : String(cause),
  });

/**
 * Decode a manifest at the registration boundary (I6) and check the one thing
 * the schema cannot: `RegisteredTransform.project` is typed `Schema.Any`, so a
 * manifest can carry a non-function there and only fail much later, at run.
 */
const decodeManifest = (
  manifest: unknown
): Effect.Effect<PackManifestType, PackRegistrationError> =>
  Effect.try({
    catch: registrationError,
    try: () => {
      const decoded = Schema.decodeUnknownSync(PackManifest)(manifest);
      for (const transform of decoded.transforms) {
        if (typeof transform.project !== "function") {
          throw new Error(
            `pack '${decoded.pack}': transform '${transform.spec.id}' registered a projection that is not a function`
          );
        }
      }
      return decoded;
    },
  });

/**
 * Fold the manifests into lookup tables. Registration is all-or-nothing: the
 * first invalid manifest fails layer construction, so a deployment either has
 * a valid catalog or does not start — it never serves a partial one.
 */
const register = (
  manifests: readonly PackManifestType[]
): Effect.Effect<Registered, PackRegistrationError> =>
  Effect.gen(function* () {
    const sources = new Map<string, SourceSpec>();
    const transforms = new Map<string, RegisteredTransformType>();
    const sourcePack = new Map<string, string>();
    const transformPack = new Map<string, string>();

    for (const raw of manifests) {
      const manifest = yield* decodeManifest(raw);
      for (const source of manifest.sources) {
        sources.set(source.id, source);
        sourcePack.set(source.id, manifest.pack);
      }
      for (const transform of manifest.transforms) {
        transforms.set(transform.spec.id, transform);
        transformPack.set(transform.spec.id, manifest.pack);
      }
    }

    return { sourcePack, sources, transformPack, transforms };
  });

const sourceEntry = (
  source: SourceSpec,
  pack: string | undefined,
  capabilities: readonly TransportKind[]
): CatalogEntry => {
  // Derived here from the same function the source runtime uses, so what the
  // catalog advertises is what acquisition actually does.
  const verdict = runnabilityOf(source, capabilities);
  return CatalogEntry.make({
    ...(pack === undefined ? {} : { pack }),
    ...(verdict.reason === undefined ? {} : { reason: verdict.reason }),
    ...(source.access === undefined ? {} : { access: source.access }),
    description: `${source.transport} source at ${source.url}`,
    id: source.id,
    kind: "source",
    name: source.id,
    runnable: verdict.runnable,
  });
};

const transformEntry = (
  transform: RegisteredTransformType,
  pack: string | undefined
): CatalogEntry =>
  CatalogEntry.make({
    ...(pack === undefined ? {} : { pack }),
    archetype: transform.spec.archetype,
    description: `${transform.spec.archetype} transform over source '${transform.spec.sourceId}'`,
    id: transform.spec.id,
    kind: "transform",
    name: transform.spec.id,
  });

const typeEntry = (name: string, definition: unknown): CatalogEntry => {
  const shape = definition as {
    readonly kind?: string;
    readonly type?: string;
  };
  const detail = shape.kind ?? shape.type;
  return CatalogEntry.make({
    description:
      detail === undefined
        ? "registered ontology type"
        : `ontology type '${detail}'`,
    id: name,
    kind: "type",
    name,
  });
};

const matches = (entry: CatalogEntry, filter: CatalogFilter | undefined) => {
  if (filter === undefined) {
    return true;
  }
  if (filter.kind !== undefined && entry.kind !== filter.kind) {
    return false;
  }
  if (filter.pack !== undefined && entry.pack !== filter.pack) {
    return false;
  }
  if (filter.runnable !== undefined && entry.runnable !== filter.runnable) {
    return false;
  }
  return !(
    filter.archetype !== undefined && entry.archetype !== filter.archetype
  );
};

/**
 * Convert a registered schema to a JSON Schema document (Draft 2020-12). The
 * source of truth is the schema that actually decodes, so the published
 * contract cannot drift from it (I6).
 *
 * `TransformSpec.input`/`output` are `Schema.Any`-typed, so a manifest can put
 * something that is not a schema there; the converter then throws a *defect*
 * (a raw TypeError), not a typed failure — hence `Effect.try`, and hence the
 * `Option.none` degrade path rather than a failed describe.
 */
const toDocument = (schema: unknown): Option.Option<unknown> => {
  try {
    return Option.some(
      JSON.parse(
        JSON.stringify(
          // biome-ignore lint/suspicious/noExplicitAny: Schema.Any field, checked by the try
          Schema.toJsonSchemaDocument(schema as any)
        )
      )
    );
  } catch {
    return Option.none();
  }
};

const GAP = "registered schema could not be converted to JSON Schema";

const describeTransform = (
  transform: RegisteredTransformType,
  entry: CatalogEntry
): CatalogEntryDetail => {
  const input = toDocument(transform.spec.input);
  const output = toDocument(transform.spec.output);
  return CatalogEntryDetail.make({
    entry,
    ...(Option.isSome(input) ? { input: input.value as never } : {}),
    ...(Option.isSome(output) ? { output: output.value as never } : {}),
    ...(Option.isSome(input) && Option.isSome(output)
      ? {}
      : { schemaGap: GAP }),
  });
};

/**
 * A source's contract is its own spec: that is what acquisition takes. Types
 * carry no invocation contract at all — an ontology type is a registered
 * instance, not something a caller invokes — so they get neither document and
 * no gap, because nothing failed.
 */
const describeSource = (entry: CatalogEntry): CatalogEntryDetail => {
  const input = toDocument(SourceSpecSchema);
  return CatalogEntryDetail.make({
    entry,
    ...(Option.isSome(input) ? { input: input.value as never } : {}),
    ...(Option.isSome(input) ? {} : { schemaGap: GAP }),
  });
};

export const CatalogLayer: Layer.Layer<
  CatalogService,
  PackRegistrationError,
  PackRegistry | OntologyRegistryService | TransformRunnerService
> = Layer.effect(
  CatalogService,
  Effect.gen(function* () {
    const manifests = yield* PackRegistry;
    const ontology = yield* OntologyRegistryService;
    const runner = yield* TransformRunnerService;
    const capabilities = Option.getOrElse(
      yield* Effect.serviceOption(TransportCapabilities),
      () => defaultTransportCapabilities
    );
    const registered = yield* register(manifests);

    const entries = Effect.gen(function* () {
      const types = yield* ontology.list;
      const out: CatalogEntry[] = [];
      for (const [id, source] of registered.sources) {
        out.push(
          sourceEntry(source, registered.sourcePack.get(id), capabilities)
        );
      }
      for (const [id, transform] of registered.transforms) {
        out.push(transformEntry(transform, registered.transformPack.get(id)));
      }
      for (const [name, definition] of types) {
        out.push(typeEntry(name, definition));
      }
      return out;
    });

    const catalog: Catalog = {
      describe: (id) =>
        Effect.gen(function* () {
          const transform = registered.transforms.get(id);
          if (transform !== undefined) {
            return describeTransform(
              transform,
              transformEntry(transform, registered.transformPack.get(id))
            );
          }
          const source = registered.sources.get(id);
          if (source !== undefined) {
            return describeSource(
              sourceEntry(source, registered.sourcePack.get(id), capabilities)
            );
          }
          const type = yield* ontology.get(id);
          if (Option.isSome(type)) {
            return CatalogEntryDetail.make({
              entry: typeEntry(id, type.value),
            });
          }
          return yield* UnknownCatalogEntry.make({
            message: `no catalog entry with id '${id}'`,
          });
        }),
      list: (filter) =>
        entries.pipe(
          Effect.map((all) => all.filter((entry) => matches(entry, filter)))
        ),
      runTransform: (
        transformId,
        input
      ): Effect.Effect<
        readonly Step[],
        UnknownCatalogEntry | TransformError
      > => {
        const transform = registered.transforms.get(transformId);
        if (transform === undefined) {
          return UnknownCatalogEntry.make({
            message: `no transform with id '${transformId}'`,
          });
        }
        return runner.run(
          transform.spec,
          transform.source,
          transform.project as never,
          input
        );
      },
    };

    return catalog;
  })
);
