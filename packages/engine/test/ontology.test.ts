import { assert, describe, it } from "@effect/vitest";
import { Entity, entityId, eventId } from "@viokit/schema";
import { Effect, Option, Schema } from "effect";
import type { OntologyRegistry } from "../src/ontology.js";
import {
  OntologyRegistryLayer,
  OntologyRegistryService,
} from "../src/ontology.js";

const freshRegistry = (): Effect.Effect<OntologyRegistry, never, never> =>
  Effect.provide(OntologyRegistryLayer)(OntologyRegistryService);

const temporal = {
  validFrom: new Date("2024-01-01T00:00:00.000Z"),
  validTo: new Date("2024-01-01T00:00:00.000Z"),
};

const person = {
  id: entityId("person"),
  identifiers: [],
  kind: "person",
  spatialExtent: { lat: 1, lon: 2 },
  temporalExtent: temporal,
};

const born = {
  entityIds: [entityId("person")],
  id: eventId("born"),
  kind: "birth",
  spatialExtent: { lat: 1, lon: 2 },
  temporalExtent: temporal,
};

describe("ontology registry", () => {
  it.effect("registers and looks up a conforming definition by name", () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry();
      yield* registry.register("person", person);
      const found = Option.getOrThrow(yield* registry.get("person"));
      if (Schema.is(Entity)(found)) {
        assert.strictEqual(found.id, entityId("person"));
        assert.strictEqual(found.kind, "person");
      } else {
        assert.fail("expected an entity");
      }
    })
  );

  it.effect("rejects a duplicate name and keeps the original", () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry();
      yield* registry.register("person", person);
      const outcome = yield* registry
        .register("person", born)
        .pipe(
          Effect.catchTag("RegistryError", () => Effect.succeed("duplicate"))
        );
      assert.strictEqual(outcome, "duplicate");
      const found = Option.getOrThrow(yield* registry.get("person"));
      if (Schema.is(Entity)(found)) {
        assert.strictEqual(found.kind, "person");
      } else {
        assert.fail("expected an entity");
      }
    })
  );

  it.effect("rejects a non-conforming definition", () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry();
      const outcome = yield* registry
        .register("bad", { id: 123 })
        .pipe(
          Effect.catchTag("RegistryError", () => Effect.succeed("invalid"))
        );
      assert.strictEqual(outcome, "invalid");
    })
  );

  it.effect("unknown lookup returns not-found", () =>
    Effect.gen(function* () {
      const registry = yield* freshRegistry();
      const found = yield* registry.get("never-registered");
      assert.isTrue(Option.isNone(found));
    })
  );
});
