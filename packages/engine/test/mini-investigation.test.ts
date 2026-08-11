import { assert, describe, layer } from "@effect/vitest";
import {
  AddEntity,
  AddRelation,
  Entity,
  type EvidenceInput,
  entityId,
  Relation,
  relationId,
  SourceSpec,
  SourceTransportService,
  TemporalExtent,
  TransformRunnerService,
  TransformSpec,
} from "@viokit/schema";
import { Effect, Layer, Schema } from "effect";
import { CacheLayer } from "../src/cache.js";
import { EgressLayer } from "../src/egress.js";
import { EvidenceBackendMemory, EvidenceLayer } from "../src/evidence-fs.js";
import { DuckDBGraphLayer, DuckDBGraphService } from "../src/graph-duckdb.js";
import { RateLimiterLayer } from "../src/rate-limit.js";
import { SourceRuntimeLayer } from "../src/source-runtime.js";
import { TransformRunnerLayer } from "../src/transform.js";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const extent = TemporalExtent.make({
  validFrom: new Date("2024-06-01T00:00:00.000Z"),
  validTo: new Date("2024-06-30T00:00:00.000Z"),
});

const mkEntity = (id: string, kind: string): Entity =>
  Entity.make({
    id: entityId(id),
    identifiers: [],
    kind,
    spatialExtent: { lat: 0, lon: 0 },
    temporalExtent: extent,
  });

const mkRelation = (
  id: string,
  source: string,
  target: string,
  type: string
): Relation =>
  Relation.make({
    id: relationId(id),
    sourceId: entityId(source),
    targetId: entityId(target),
    temporalExtent: extent,
    type,
  });

// The three sources of a mini-investigation: whois, dns, and a breach feed.
const whoisSource = SourceSpec.make({
  id: "whois",
  transport: "http",
  url: "https://whois.example/example.com",
});
const dnsSource = SourceSpec.make({
  id: "dns",
  transport: "http",
  url: "https://dns.example/example.com",
});
const breachSource = SourceSpec.make({
  id: "breach",
  transport: "http",
  url: "https://breach.example/93.184.216.34",
});

const dispatchTransport = Layer.succeed(SourceTransportService, {
  fetch: (source) =>
    Effect.succeed({
      bytes: (() => {
        if (source.url.includes("whois")) {
          return text("registrant: acme corp");
        }
        if (source.url.includes("dns")) {
          return text("93.184.216.34");
        }
        return text("93.184.216.34 found in breachX");
      })(),
      contentType: "text/plain",
    }),
});

const runtimeLayer = Layer.provide(
  SourceRuntimeLayer,
  Layer.merge(
    Layer.merge(dispatchTransport, CacheLayer),
    Layer.merge(EgressLayer, RateLimiterLayer)
  )
);

const evidenceLayer = Layer.provide(EvidenceLayer, EvidenceBackendMemory);

const transformLayer = Layer.provide(
  TransformRunnerLayer,
  Layer.merge(runtimeLayer, evidenceLayer)
);

const whoisSpec = TransformSpec.make({
  archetype: "extract",
  id: "t-whois",
  input: Schema.Any,
  output: Schema.Any,
  projection: Schema.Any,
  sourceId: "whois",
});

const whoisProject = (_evidence: EvidenceInput, _input: unknown) => [
  AddEntity.make({ entity: mkEntity("domain", "domain") }),
  AddEntity.make({ entity: mkEntity("acme", "organization") }),
  AddRelation.make({
    relation: mkRelation("r-owned-by", "domain", "acme", "ownedBy"),
  }),
];

const dnsProject = (_evidence: EvidenceInput, _input: unknown) => [
  AddEntity.make({ entity: mkEntity("ip", "ip-address") }),
  AddRelation.make({
    relation: mkRelation("r-resolves-to", "domain", "ip", "resolvesTo"),
  }),
];

const breachProject = (_evidence: EvidenceInput, _input: unknown) => [
  AddEntity.make({ entity: mkEntity("breachX", "breach") }),
  AddRelation.make({
    relation: mkRelation("r-found-in", "ip", "breachX", "foundIn"),
  }),
];

const investigationLayer = Layer.merge(transformLayer, DuckDBGraphLayer);

/**
 * P2 exit proof (Workstream 4): a mini-investigation — whois → dns → breach —
 * flows through the real pipeline (SourceRuntime → Evidence → TransformRunner
 * → DuckDB graph). Replay reproduces the folded state (I3), and `relatedness`
 * ranks the reachable candidates from the domain seed.
 */
describe("P2 exit proof: mini-investigation end-to-end", () => {
  layer(investigationLayer)((it) => {
    it.effect(
      "whois → dns → breach lands in the graph; replay reproduces state (I3)",
      () =>
        Effect.gen(function* () {
          const runner = yield* TransformRunnerService;
          const graph = yield* DuckDBGraphService;

          const whoisSteps = yield* runner.run(
            whoisSpec,
            whoisSource,
            whoisProject,
            null
          );
          const dnsSteps = yield* runner.run(
            whoisSpec,
            dnsSource,
            dnsProject,
            null
          );
          const breachSteps = yield* runner.run(
            whoisSpec,
            breachSource,
            breachProject,
            null
          );

          const allSteps = [...whoisSteps, ...dnsSteps, ...breachSteps];
          for (const step of allSteps) {
            yield* graph.insert(step);
          }

          const state = yield* graph.replay;
          const ids = state.entities.map((entity) => entity.id).sort();
          assert.deepStrictEqual(ids, ["acme", "breachX", "domain", "ip"]);
          assert.strictEqual(state.relations.length, 3);

          // Every step was attributed to the evidence that produced it (I2).
          assert.isTrue(
            allSteps.every((step) => step.evidenceIds.length === 1)
          );

          // Replay is deterministic: a second fold reproduces the same state (I3).
          const second = yield* graph.replay;
          assert.strictEqual(second.entities.length, state.entities.length);
          assert.strictEqual(second.relations.length, 3);
        })
    );

    it.effect("relatedness ranks candidates reachable from the domain", () =>
      Effect.gen(function* () {
        const runner = yield* TransformRunnerService;
        const graph = yield* DuckDBGraphService;

        for (const [spec, source, project] of [
          [whoisSpec, whoisSource, whoisProject],
          [whoisSpec, dnsSource, dnsProject],
          [whoisSpec, breachSource, breachProject],
        ] as const) {
          const steps = yield* runner.run(spec, source, project, null);
          for (const step of steps) {
            yield* graph.insert(step);
          }
        }
        yield* graph.replay;

        const related = yield* graph.relatedness("domain", 5);
        assert.deepStrictEqual(
          related.map((result) => result.entityId),
          ["acme", "ip", "breachX"]
        );
        const [acme, ip, breach] = related;
        assert.isDefined(acme);
        assert.isDefined(ip);
        assert.isDefined(breach);
        assert.strictEqual(acme.distance, 1);
        assert.strictEqual(ip.distance, 1);
        assert.strictEqual(breach.distance, 2);
      })
    );
  });
});
