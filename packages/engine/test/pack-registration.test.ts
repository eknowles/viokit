import { assert, describe, layer } from "@effect/vitest";
import { manifest as peopleManifest } from "@viokit/packs/people-identity/manifest";
import { judyrecords_com } from "@viokit/packs/people-identity/sources";
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

const peopleIdentity = Layer.provide(
  makeEngineLayer([peopleManifest]),
  Layer.mergeAll(transport, EvidenceBackendMemory, OntologyRegistryLayer)
);

/**
 * The case this whole change exists for: a real pack whose sources are mostly
 * not acquirable here.
 */
describe("registering a pack whose sources are browser-gated", () => {
  layer(peopleIdentity)((it) => {
    it.effect("reports the browser-only sources as present but unusable", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const entries = yield* engine.catalog({ kind: "source" });
        assert.strictEqual(entries.length, 5);

        const gated = entries.filter((entry) => entry.runnable === false);
        assert.deepStrictEqual(gated.map((entry) => entry.id).sort(), [
          "judyrecords.com",
          "voterrecords.com",
        ]);
        for (const entry of gated) {
          assert.strictEqual(entry.access, "browser_scrape");
          assert.include(entry.reason ?? "", "browser");
        }
      })
    );

    it.effect(
      "narrows to the sources this deployment can actually acquire",
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const usable = yield* engine.catalog({
            kind: "source",
            runnable: true,
          });
          assert.strictEqual(usable.length, 3);
          assert.isFalse(
            usable.some((entry) => entry.id.includes("judyrecords"))
          );
        })
    );

    it.effect("refuses to acquire a browser-only source, with its reason", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const result = yield* Effect.result(engine.acquire(judyrecords_com));

        assert.strictEqual(result._tag, "Failure");
        if (result._tag === "Failure") {
          assert.strictEqual(
            (result.failure as { _tag: string })._tag,
            "SourceNotRunnable"
          );
        }
      })
    );
  });
});
