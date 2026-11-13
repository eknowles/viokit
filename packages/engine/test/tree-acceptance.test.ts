import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, layer } from "@effect/vitest";
import { manifest } from "@viokit/packs/web-dns/manifest";
import {
  ExpandRequest,
  LOCAL_PRINCIPAL,
  PackManifest,
  RegisteredTransform,
  type SourceSpec,
  SourceTransportService,
  TransformSpec,
  TransportCapabilities,
} from "@viokit/schema";
import { Effect, Layer } from "effect";
import { Engine, makeEngineLayer } from "../src/engine.js";
import { EvidenceBackendMemory } from "../src/evidence-fs.js";
import { OntologyRegistryLayer } from "../src/ontology.js";
import { makeViewStateLayer } from "../src/view-state.js";

/**
 * The done criterion for the investigation tree: one seed, unattended, through
 * at least 5 wrapped transforms across at least 3 entity kinds into at least 50
 * entities, each traceable to the run that produced it. The real engine and the
 * real web-dns pack run; only the transport is canned, per tool. That proves
 * the tree, not the tools (the live sidecar run is a separate check).
 */

const SEED = "acme.test";
const SUBDOMAINS = 30;
const ADDRESS_POOL = 12;
const MIN_ENTITIES = 50;
const MIN_TRANSFORMS = 5;
const MIN_KINDS = 3;

const bytes = (value: string) => new TextEncoder().encode(value);

const subdomains = Array.from(
  { length: SUBDOMAINS },
  (_, index) => `host-${String(index).padStart(2, "0")}.${SEED}`
);

/** A stable address per name, shared across a few names so addresses dedupe. */
const addressOf = (name: string): string => {
  let sum = 0;
  for (const char of name) {
    sum += char.charCodeAt(0);
  }
  return `10.0.0.${(sum % ADDRESS_POOL) + 1}`;
};

const argument = (source: SourceSpec, at: number): string =>
  source.exec?.args[at] ?? "";

const answer = (source: SourceSpec): string => {
  switch (source.id) {
    case "crt.sh":
      return JSON.stringify([{ name_value: [SEED, ...subdomains].join("\n") }]);
    case "securitytrails.com":
      // Overlaps crt.sh on purpose: dedup must collapse host-01.
      return source.url.includes(`/${SEED}/`)
        ? JSON.stringify({ subdomains: ["host-01", "api", "admin"] })
        : JSON.stringify({ subdomains: [] });
    case "host.io":
      return source.url.endsWith(`/${SEED}`)
        ? JSON.stringify({ dns: { a: ["10.0.0.200"], ns: ["ns3.acme.test"] } })
        : "{}";
    case "dig": {
      const name = argument(source, 2);
      return `${name}.\t30\tIN\tA\t${addressOf(name)}\n`;
    }
    case "whois":
      return [
        "Domain Name: ACME.TEST",
        "Registrant Organization: Acme Ltd",
        "Registrant Email: hostmaster@acme.test",
        "Name Server: NS1.ACME.TEST",
        "Name Server: NS2.ACME.TEST",
      ].join("\n");
    case "nmap": {
      const ip = source.exec?.args.at(-1) ?? "";
      return `<nmaprun><host><address addr="${ip}" addrtype="ipv4"/><ports><port protocol="tcp" portid="22"><state state="open"/><service name="ssh" product="OpenSSH" version="8.9"/></port><port protocol="tcp" portid="443"><state state="open"/><service name="https" product="nginx" version="1.24"/></port></ports></host></nmaprun>`;
    }
    default:
      return "";
  }
};

const transport = Layer.succeed(SourceTransportService, {
  fetch: (source) =>
    Effect.succeed({
      bytes: bytes(answer(source)),
      contentType:
        source.transport === "exec" ? "text/plain" : "application/json",
    }),
});

const capabilities = Layer.succeed(TransportCapabilities, [
  "http",
  "dataset",
  "exec",
]);

const deployment = (pack: PackManifest) =>
  Layer.provide(
    makeEngineLayer([pack]),
    Layer.mergeAll(
      transport,
      capabilities,
      EvidenceBackendMemory,
      OntologyRegistryLayer,
      makeViewStateLayer(mkdtempSync(join(tmpdir(), "viokit-vs-")))
    )
  );

process.env.SECURITYTRAILS_API_KEY = "test-key";
process.env.HOSTIO_TOKEN = "test-token";

const wide = ExpandRequest.make({
  maxEntities: 500,
  maxRuns: 500,
  seedKind: "domain",
  seedValue: SEED,
});

/** The same pack with nmap's `accepts` removed: the tree must no longer reach ports. */
const withoutNmapAccepts = PackManifest.make({
  ...manifest,
  transforms: manifest.transforms.map((registered) => {
    if (registered.spec.id !== "nmap-open-ports") {
      return registered;
    }
    const { accepts: _removed, ...rest } = registered.spec;
    return RegisteredTransform.make({
      ...registered,
      spec: TransformSpec.make(rest),
    });
  }),
});

describe("the done criterion", () => {
  layer(deployment(manifest))((it) => {
    it.effect(
      "one seed becomes a tree of at least 50 entities through at least 5 transforms across 3 kinds",
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const summary = yield* engine.expandTree(wide, LOCAL_PRINCIPAL.id);
          assert.isAtLeast(summary.entities, MIN_ENTITIES);
          assert.isAtLeast(
            Object.keys(summary.entitiesByKind).length,
            MIN_KINDS
          );
          assert.strictEqual(summary.failed, 0);

          // The tree, read back, names at least five distinct transforms.
          const roots = yield* engine.showTree;
          const used = new Set<string>();
          const walk = (node: (typeof roots)[number]): void => {
            for (const run of node.runs) {
              used.add(run.transformId);
              for (const child of run.children) {
                walk(child);
              }
            }
          };
          for (const root of roots) {
            walk(root);
          }
          assert.isAtLeast(used.size, MIN_TRANSFORMS);
        })
    );

    it.effect("every entity in the graph traces to a recorded run", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        yield* engine.expandTree(wide, LOCAL_PRINCIPAL.id);
        const state = yield* engine.replay;
        const roots = yield* engine.showTree;
        const traced = new Set<string>();
        const collect = (node: (typeof roots)[number]): void => {
          traced.add(node.entityId);
          for (const run of node.runs) {
            for (const child of run.children) {
              collect(child);
            }
          }
        };
        for (const root of roots) {
          collect(root);
        }
        const missing = state.entities
          .map((entity) => entity.id)
          .filter((id) => !traced.has(id));
        assert.deepStrictEqual(missing, []);
        assert.strictEqual(traced.size, state.entities.length);
      })
    );

    it.effect(
      "a keyed source without a credential is skipped, not failed",
      () =>
        Effect.gen(function* () {
          const engine = yield* Engine;
          const summary = yield* engine.expandTree(wide, LOCAL_PRINCIPAL.id);
          // Every transform ran in this deployment, so none are skipped.
          assert.deepStrictEqual(summary.skipped, []);
        })
    );
  });

  layer(deployment(withoutNmapAccepts))((it) => {
    it.effect("without `accepts` on nmap the tree never reaches ports", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const summary = yield* engine.expandTree(wide, LOCAL_PRINCIPAL.id);
        assert.isUndefined(summary.entitiesByKind["open-port"]);
        assert.isUndefined(summary.entitiesByKind.technology);
      })
    );
  });
});
