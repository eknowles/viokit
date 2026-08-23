import { assert, describe, layer } from "@effect/vitest";
import {
  AddEntity,
  Entity,
  type EvidenceInput,
  entityId,
  PackManifest,
  RegisteredTransform,
  SourceSpec,
  SourceTransportService,
  TemporalExtent,
  TransformSpec,
} from "@viokit/schema";
import { Effect, Layer, Schema } from "effect";
import { Engine, EngineLayer, makeEngineLayer } from "../src/engine.js";
import { EvidenceBackendMemory } from "../src/evidence-fs.js";
import {
  OntologyRegistryLayer,
  OntologyRegistryService,
} from "../src/ontology.js";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const extent = TemporalExtent.make({
  validFrom: new Date("2024-06-01T00:00:00.000Z"),
  validTo: new Date("2024-06-30T00:00:00.000Z"),
});

const whoisSource = SourceSpec.make({
  id: "whois",
  transport: "http",
  url: "https://whois.example/lookup",
});

const dnsSource = SourceSpec.make({
  id: "dns",
  transport: "http",
  url: "https://dns.example/resolve",
});

const WhoisInput = Schema.Struct({ domain: Schema.String });
const WhoisOutput = Schema.Struct({ registrar: Schema.String });

const whoisSpec = TransformSpec.make({
  archetype: "lookup",
  id: "whois-lookup",
  input: WhoisInput,
  output: WhoisOutput,
  projection: Schema.Any,
  sourceId: "whois",
});

const whoisProject = (_evidence: EvidenceInput, input: unknown) => [
  AddEntity.make({
    entity: Entity.make({
      id: entityId((input as { domain: string }).domain),
      identifiers: [],
      kind: "domain",
      spatialExtent: { lat: 0, lon: 0 },
      temporalExtent: extent,
    }),
  }),
];

const webDns = PackManifest.make({
  pack: "web-dns",
  sources: [whoisSource, dnsSource],
  transforms: [
    RegisteredTransform.make({
      project: whoisProject,
      source: whoisSource,
      spec: whoisSpec,
    }),
  ],
});

const transport = Layer.succeed(SourceTransportService, {
  fetch: (source) =>
    Effect.succeed({
      bytes: text(`response from ${source.id}`),
      contentType: "text/plain",
    }),
});

const deployment = Layer.mergeAll(
  transport,
  EvidenceBackendMemory,
  OntologyRegistryLayer
);

const withPacks = Layer.provide(makeEngineLayer([webDns]), deployment);

// The ontology registry is deployment-owned, so the test can register a type
// into the same instance the catalog reads from.
const withoutPacks = Layer.provideMerge(
  Layer.provide(EngineLayer, deployment),
  OntologyRegistryLayer
);

describe("catalog over a registered pack", () => {
  layer(withPacks)((it) => {
    it.effect(
      "lists registered sources and transforms, attributed to their pack",
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const entries = yield* engine.catalog();

          const ids = entries.map((entry) => entry.id).sort();
          assert.deepStrictEqual(ids, ["dns", "whois", "whois-lookup"]);
          assert.isTrue(entries.every((entry) => entry.pack === "web-dns"));

          const transform = entries.find(
            (entry) => entry.id === "whois-lookup"
          );
          assert.strictEqual(transform?.kind, "transform");
          assert.strictEqual(transform?.archetype, "lookup");
        })
    );

    it.effect("narrows the listing by kind, pack, and archetype", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;

        const sources = yield* engine.catalog({ kind: "source" });
        assert.strictEqual(sources.length, 2);

        const lookups = yield* engine.catalog({ archetype: "lookup" });
        assert.strictEqual(lookups.length, 1);
        assert.strictEqual(lookups[0]?.id, "whois-lookup");

        // Every supplied field must match: kind and archetype together.
        const both = yield* engine.catalog({
          archetype: "lookup",
          kind: "source",
        });
        assert.strictEqual(both.length, 0);
      })
    );

    it.effect("a filter matching nothing returns empty, not an error", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const none = yield* engine.catalog({ pack: "no-such-pack" });
        assert.deepStrictEqual(none, []);
      })
    );

    it.effect("describes a transform's input and output as JSON Schema", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const detail = yield* engine.describe("whois-lookup");

        assert.strictEqual(detail.entry.archetype, "lookup");
        assert.strictEqual(detail.schemaGap, undefined);

        const input = detail.input as {
          schema: { properties: { domain: { type: string } } };
        };
        assert.strictEqual(input.schema.properties.domain.type, "string");

        const output = detail.output as {
          schema: { properties: { registrar: { type: string } } };
        };
        assert.strictEqual(output.schema.properties.registrar.type, "string");
      })
    );

    it.effect("an input built from the described schema decodes (I6)", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const detail = yield* engine.describe("whois-lookup");
        const input = detail.input as {
          schema: {
            properties: { domain: { type: string } };
            required: readonly string[];
          };
        };

        // Build a value from the published contract alone: one required
        // property, of type string.
        const built: Record<string, unknown> = {};
        for (const key of input.schema.required) {
          built[key] = "acme.test";
        }

        const steps = yield* engine.runCatalogTransform("whois-lookup", built);
        assert.strictEqual(steps.length, 1);
        assert.strictEqual(steps[0]?.evidenceIds.length, 1);
      })
    );

    it.effect(
      "runs a transform by catalog id, projection resolved from the pack",
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const steps = yield* engine.runCatalogTransform("whois-lookup", {
            domain: "acme.test",
          });

          assert.strictEqual(steps.length, 1);
          const [step] = steps;
          assert.strictEqual(step?.operation._tag, "AddEntity");
          // Every step is attributed to the run's evidence (I2).
          assert.strictEqual(step?.evidenceIds.length, 1);

          for (const committed of steps) {
            yield* engine.insert(committed);
          }
          const state = yield* engine.replay;
          assert.strictEqual(state.entities[0]?.id, "acme.test");
        })
    );

    it.effect("rejects an input that fails the transform's schema (I6)", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const result = yield* Effect.result(
          engine.runCatalogTransform("whois-lookup", { domain: 42 })
        );
        assert.isTrue(result._tag === "Failure");
      })
    );

    it.effect(
      "describing an unknown id is an error, not an empty success",
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const result = yield* Effect.result(engine.describe("no-such-entry"));
          assert.isTrue(result._tag === "Failure");
          if (result._tag === "Failure") {
            assert.strictEqual(result.failure._tag, "UnknownCatalogEntry");
          }
        })
    );

    it.effect("running an unregistered transform id is an error", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const result = yield* Effect.result(
          engine.runCatalogTransform("no-such-transform", {})
        );
        assert.isTrue(result._tag === "Failure");
        if (result._tag === "Failure") {
          assert.strictEqual(result.failure._tag, "UnknownCatalogEntry");
        }
      })
    );

    it.effect("catalog reads append no step and write no evidence (I3)", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const before = yield* engine.log;

        yield* engine.catalog();
        yield* engine.catalog({ kind: "transform" });
        yield* engine.describe("whois-lookup");
        yield* engine.describe("whois");

        const after = yield* engine.log;
        assert.strictEqual(after.length, before.length);
      })
    );

    it.effect("a source describes its own acquisition contract", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const detail = yield* engine.describe("whois");
        assert.strictEqual(detail.entry.kind, "source");
        assert.isDefined(detail.input);
        assert.strictEqual(detail.schemaGap, undefined);
      })
    );
  });
});

describe("catalog without registered packs", () => {
  layer(withoutPacks)((it) => {
    it.effect("an unregistered pack's sources stay invisible", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const entries = yield* engine.catalog();
        // `whois`/`dns` exist as specs in this file but no manifest registers
        // them here, so the catalog does not report them.
        assert.deepStrictEqual(entries, []);
      })
    );

    it.effect("reports ontology types registered at runtime", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const ontology = yield* OntologyRegistryService;

        yield* ontology.register("domain", {
          id: entityId("domain-proto"),
          identifiers: [],
          kind: "domain",
          spatialExtent: { lat: 0, lon: 0 },
          temporalExtent: extent,
        });

        const types = yield* engine.catalog({ kind: "type" });
        assert.strictEqual(types.length, 1);
        assert.strictEqual(types[0]?.id, "domain");
        assert.strictEqual(types[0]?.pack, undefined);
      })
    );
  });
});
