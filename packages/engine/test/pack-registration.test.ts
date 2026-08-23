import { assert, describe, layer } from "@effect/vitest";
import { manifest } from "@viokit/packs/web-dns/manifest";
import { SourceTransportService } from "@viokit/schema";
import { Effect, Layer } from "effect";
import { Engine, makeEngineLayer } from "../src/engine.js";
import { EvidenceBackendMemory } from "../src/evidence-fs.js";
import { OntologyRegistryLayer } from "../src/ontology.js";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const transport = Layer.succeed(SourceTransportService, {
  fetch: () =>
    Effect.succeed({
      bytes: text('[{"name_value":"acme.test"}]'),
      contentType: "application/json",
    }),
});

/**
 * The real `web-dns` pack registered into a real engine: the catalog reports
 * what the pack ships, and its transform runs by id with the projection the
 * pack bound to it.
 */
const withWebDns = Layer.provide(
  makeEngineLayer([manifest]),
  Layer.mergeAll(transport, EvidenceBackendMemory, OntologyRegistryLayer)
);

describe("registering the web-dns pack", () => {
  layer(withWebDns)((it) => {
    it.effect("surfaces the pack's sources and transform in the catalog", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const entries = yield* engine.catalog({ pack: "web-dns" });

        const sources = entries.filter((entry) => entry.kind === "source");
        const transforms = entries.filter(
          (entry) => entry.kind === "transform"
        );
        assert.strictEqual(sources.length, 9);
        assert.strictEqual(transforms.length, 1);
        assert.strictEqual(transforms[0]?.id, "crt-sh-certificate-search");
        assert.strictEqual(transforms[0]?.archetype, "search");
        assert.isTrue(sources.some((entry) => entry.id === "crt.sh"));
      })
    );

    it.effect("describes the pack transform's published contract", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const detail = yield* engine.describe("crt-sh-certificate-search");
        const input = detail.input as {
          schema: { properties: { domain: { type: string } } };
        };
        assert.strictEqual(input.schema.properties.domain.type, "string");
        assert.strictEqual(detail.schemaGap, undefined);
      })
    );

    it.effect("runs the pack transform by id and commits its steps", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const steps = yield* engine.runCatalogTransform(
          "crt-sh-certificate-search",
          { domain: "acme.test" }
        );

        // domain entity, certificate entity, and the relation between them.
        assert.strictEqual(steps.length, 3);
        // Every step attributed to the run's evidence (I2).
        assert.isTrue(steps.every((step) => step.evidenceIds.length === 1));

        for (const step of steps) {
          yield* engine.insert(step);
        }
        const state = yield* engine.replay;
        assert.strictEqual(state.entities.length, 2);
        assert.strictEqual(state.relations.length, 1);

        const related = yield* engine.relatedness("acme.test");
        assert.deepStrictEqual(related, [
          {
            distance: 1,
            entityId: "cert:acme.test",
            relationType: "presents-certificate",
          },
        ]);
      })
    );
  });
});
