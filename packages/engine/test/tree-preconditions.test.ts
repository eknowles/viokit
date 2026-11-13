import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, layer } from "@effect/vitest";
import { manifest } from "@viokit/packs/web-dns/manifest";
import {
  AddEntity,
  Entity,
  entityId,
  Identifier,
  Live,
  LOCAL_PRINCIPAL,
  NonEmptyEvidenceIds,
  SourceTransportService,
  SpatialExtent,
  Step,
  stepId,
  TemporalExtent,
  TransportCapabilities,
} from "@viokit/schema";
import { Effect, Layer } from "effect";
import { Engine, makeEngineLayer } from "../src/engine.js";
import { EvidenceBackendMemory } from "../src/evidence-fs.js";
import { OntologyRegistryLayer } from "../src/ontology.js";
import { makeViewStateLayer } from "../src/view-state.js";

/**
 * What the investigation tree depends on, checked against the real engine
 * before the expander is built on top of it (investigation-tree, task 1.1).
 */

const text = (value: string) => new TextEncoder().encode(value);

const DIG_ANSWER = "example.com.\t\t35\tIN\tA\t93.184.216.34\n";

const transport = Layer.succeed(SourceTransportService, {
  fetch: () =>
    Effect.succeed({ bytes: text(DIG_ANSWER), contentType: "text/plain" }),
});

const capabilities = Layer.succeed(TransportCapabilities, [
  "http",
  "dataset",
  "exec",
]);

const withWebDns = Layer.provide(
  makeEngineLayer([manifest]),
  Layer.mergeAll(
    transport,
    capabilities,
    EvidenceBackendMemory,
    OntologyRegistryLayer,
    makeViewStateLayer(mkdtempSync(join(tmpdir(), "viokit-vs-")))
  )
);

describe("what the investigation tree depends on", () => {
  layer(withWebDns)((it) => {
    it.effect(
      "committing the same entity from two runs leaves one entity",
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          for (let run = 0; run < 2; run += 1) {
            const steps = yield* engine.runCatalogTransform("dig-resolve", {
              domain: "example.com",
            });
            for (const step of steps) {
              yield* engine.insert(step);
            }
          }
          const state = yield* engine.replay;
          const addresses = state.entities.filter(
            (entity) => entity.id === "93.184.216.34"
          );
          const domains = state.entities.filter(
            (entity) => entity.id === "example.com"
          );
          assert.strictEqual(addresses.length, 1);
          assert.strictEqual(domains.length, 1);
        })
    );

    it.effect(
      "runnability is reported per source, reachable from a transform",
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const sources = yield* engine.catalog({ kind: "source" });
          const byId = new Map(sources.map((entry) => [entry.id, entry]));
          // The expander maps a transform to its source through the manifest
          // (the catalog's transform entries carry no source id) and reads the
          // source's runnability from here.
          for (const registered of manifest.transforms) {
            const entry = byId.get(registered.source.id);
            assert.isDefined(
              entry,
              `no catalog entry for '${registered.source.id}'`
            );
            assert.isBoolean(entry?.runnable);
          }
          const dig = byId.get("dig");
          assert.isTrue(dig?.runnable);
        })
    );

    it.effect("a seed is recorded as evidence and attributed", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const evidence = yield* engine.ingest(
          {
            acquiredAt: new Date("2026-11-14T00:00:00.000Z"),
            acquisitionPath: Live.make({}),
            bytes: text(
              JSON.stringify({ kind: "domain", value: "seed.example" })
            ),
            contentType: "application/json",
            observedAt: new Date("2026-11-14T00:00:00.000Z"),
          },
          LOCAL_PRINCIPAL.id
        );
        const entity = Entity.make({
          id: entityId("seed.example"),
          identifiers: [
            Identifier.make({ kind: "domain", value: "seed.example" }),
          ],
          kind: "domain",
          spatialExtent: SpatialExtent.make({ lat: 0, lon: 0 }),
          temporalExtent: TemporalExtent.make({
            validFrom: new Date(0),
            validTo: new Date("9999-12-31T00:00:00.000Z"),
          }),
        });
        yield* engine.insert(
          Step.make({
            evidenceIds: NonEmptyEvidenceIds.make([evidence.id]),
            id: stepId("seed-step-1"),
            operation: AddEntity.make({ entity }),
          })
        );
        const state = yield* engine.replay;
        assert.isTrue(state.entities.some((one) => one.id === "seed.example"));
      })
    );
  });
});

describe("what each transform accepts", () => {
  layer(withWebDns)((it) => {
    it.effect(
      "the catalog lists accepted kinds, and none for undeclared transforms",
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const transforms = yield* engine.catalog({ kind: "transform" });
          const accepts = new Map(
            transforms.map((entry) => [entry.id, entry.accepts])
          );
          assert.deepStrictEqual(
            { ...accepts.get("dig-resolve") },
            { field: "domain", kind: "domain" }
          );
          assert.deepStrictEqual(
            { ...accepts.get("nmap-open-ports") },
            { field: "ip", kind: "ip-address" }
          );
          assert.deepStrictEqual(
            { ...accepts.get("whois-registration") },
            { field: "domain", kind: "domain" }
          );
          // Sources never carry it.
          const sources = yield* engine.catalog({ kind: "source" });
          assert.isTrue(sources.every((entry) => entry.accepts === undefined));
        })
    );
  });
});
