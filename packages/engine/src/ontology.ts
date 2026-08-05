import type { OntologyDefinition as OntologyDefinitionType } from "@viokit/schema";
import { OntologyDefinition, RegistryError } from "@viokit/schema";
import { Context, Effect, Layer, Option, Schema } from "effect";

const decodeDefinition = (
  definition: unknown
): Effect.Effect<OntologyDefinitionType, RegistryError> =>
  Schema.decodeUnknownEffect(OntologyDefinition)(definition).pipe(
    Effect.mapError((cause) =>
      RegistryError.make({
        message: cause instanceof Error ? cause.message : String(cause),
      })
    )
  );

/**
 * Runtime registry for ontology type definitions. Definitions are validated
 * against the core primitive schemas before registration (I6), duplicates are
 * rejected, and unknown lookups return not-found. The registry holds only core
 * primitives; domain types are registered by packs at runtime (open-domain).
 */
export interface OntologyRegistry {
  readonly get: (
    name: string
  ) => Effect.Effect<Option.Option<OntologyDefinitionType>>;
  readonly register: (
    name: string,
    definition: unknown
  ) => Effect.Effect<OntologyDefinitionType, RegistryError>;
  readonly validate: (
    definition: unknown
  ) => Effect.Effect<OntologyDefinitionType, RegistryError>;
}

export class OntologyRegistryService extends Context.Service<
  OntologyRegistryService,
  OntologyRegistry
>()("OntologyRegistryService", {
  make: Effect.sync(() => {
    const byName = new Map<string, OntologyDefinitionType>();

    const registry: OntologyRegistry = {
      get: (name) =>
        Effect.sync(() =>
          byName.has(name)
            ? Option.some(byName.get(name) as OntologyDefinitionType)
            : Option.none()
        ),
      register: (name, definition) =>
        Effect.gen(function* () {
          const validated = yield* decodeDefinition(definition);
          if (byName.has(name)) {
            return yield* RegistryError.make({
              message: `ontology type '${name}' is already registered`,
            });
          }
          byName.set(name, validated);
          return validated;
        }),
      validate: (definition) => decodeDefinition(definition),
    };

    return registry;
  }),
}) {}

export const OntologyRegistryLayer = Layer.effect(
  OntologyRegistryService,
  OntologyRegistryService.make
);
