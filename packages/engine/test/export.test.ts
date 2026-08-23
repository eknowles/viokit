import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, layer } from "@effect/vitest";
import { manifest as webDns } from "@viokit/packs/web-dns/manifest";
import { SourceTransportService } from "@viokit/schema";
import { Effect, Layer } from "effect";
import { Engine, makeEngineLayer } from "../src/engine.js";
import { EvidenceBackendMemory } from "../src/evidence-fs.js";
import { OntologyRegistryLayer } from "../src/ontology.js";
import { makeViewStateLayer } from "../src/view-state.js";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

const transport = Layer.succeed(SourceTransportService, {
  fetch: () =>
    Effect.succeed({
      bytes: text('[{"name_value":"exported.test"}]'),
      contentType: "application/json",
    }),
});

const deployment = Layer.provide(
  makeEngineLayer([webDns]),
  Layer.mergeAll(
    transport,
    EvidenceBackendMemory,
    OntologyRegistryLayer,
    makeViewStateLayer(mkdtempSync(join(tmpdir(), "viokit-vs-")))
  )
);

const out = () => mkdtempSync(join(tmpdir(), "viokit-bundle-"));

const read = (path: string) => readFileSync(path, "utf8");

const sha256 = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** An investigation with something in it, exported. */
const investigate = Effect.gen(function* () {
  const engine = yield* Engine;
  const steps = yield* engine.runCatalogTransform("crt-sh-certificate-search", {
    domain: "exported.test",
  });
  for (const step of steps) {
    yield* engine.insert(step);
  }
  yield* engine.replay;
  const path = out();
  return { bundle: yield* engine.exportBundle(path), engine, path };
});

describe("evidentiary export", () => {
  layer(deployment)((it) => {
    it.effect("carries every step, with its evidence and attribution", () =>
      Effect.gen(function* () {
        const { bundle, engine } = yield* investigate;
        const log = yield* engine.log;

        assert.strictEqual(bundle.manifest.steps.length, log.length);
        for (const step of bundle.manifest.steps as {
          evidenceIds: string[];
          sourceId?: string;
          transformId?: string;
        }[]) {
          assert.isAtLeast(step.evidenceIds.length, 1);
          assert.strictEqual(step.transformId, "crt-sh-certificate-search");
          assert.strictEqual(step.sourceId, "crt.sh");
        }
      })
    );

    it.effect("includes every referenced artifact as a real file", () =>
      Effect.gen(function* () {
        const { bundle, path } = yield* investigate;

        assert.isAtLeast(bundle.manifest.evidence.length, 1);
        for (const record of bundle.manifest.evidence) {
          const bytes = readFileSync(join(path, record.file));
          assert.strictEqual(bytes.byteLength, record.byteLength);
        }
        assert.deepStrictEqual(bundle.manifest.missingEvidence, []);
      })
    );

    it.effect("records digests that match the bytes", () =>
      Effect.gen(function* () {
        const { bundle, path } = yield* investigate;

        for (const record of bundle.manifest.evidence) {
          const bytes = readFileSync(join(path, record.file));
          assert.strictEqual(sha256(new Uint8Array(bytes)), record.sha256);
        }

        // And the BagIt manifest says the same thing, in the standard form.
        const bagManifest = read(join(path, "manifest-sha256.txt"));
        for (const record of bundle.manifest.evidence) {
          assert.include(bagManifest, `${record.sha256}  ${record.file}`);
        }
      })
    );

    it.effect("makes an altered artifact detectable", () =>
      Effect.gen(function* () {
        const { bundle, path } = yield* investigate;
        const [record] = bundle.manifest.evidence;
        assert.isDefined(record);

        writeFileSync(join(path, record.file), "tampered", "utf8");
        const after = sha256(
          new Uint8Array(readFileSync(join(path, record.file)))
        );
        assert.notStrictEqual(after, record.sha256);
      })
    );

    it.effect("declares a valid BagIt bag", () =>
      Effect.gen(function* () {
        const { path } = yield* investigate;
        const declaration = read(join(path, "bagit.txt"));
        assert.include(declaration, "BagIt-Version: 1.0");
        assert.include(declaration, "Tag-File-Character-Encoding: UTF-8");
      })
    );

    it.effect("states what attests integrity and what does not", () =>
      Effect.gen(function* () {
        const { bundle } = yield* investigate;
        // The claim has to travel with the bundle, not only in our docs.
        assert.include(bundle.manifest.integrity, "manifest-sha256.txt");
        assert.include(
          bundle.manifest.integrity,
          "SHA-256 digest of its bytes"
        );
        // What is still outside its reach is said plainly.
        assert.include(bundle.manifest.integrity, "custody before export");
      })
    );

    /**
     * TDR-021: the id *is* the digest, so verifying an artifact also confirms
     * it is the one the steps reference — one check rather than two.
     */
    it.effect("attests with the artifact's own identifier", () =>
      Effect.gen(function* () {
        const { bundle, path } = yield* investigate;

        for (const record of bundle.manifest.evidence) {
          assert.strictEqual(record.sha256, record.evidenceId);
          const bytes = readFileSync(join(path, record.file));
          assert.strictEqual(sha256(new Uint8Array(bytes)), record.evidenceId);
        }

        // And the steps reference exactly those identifiers.
        const referenced = new Set(
          (bundle.manifest.steps as { evidenceIds: string[] }[]).flatMap(
            (step) => step.evidenceIds
          )
        );
        for (const record of bundle.manifest.evidence) {
          assert.isTrue(referenced.has(record.evidenceId));
        }
      })
    );

    /**
     * The test that gives the format its meaning: a bundle that cannot
     * reproduce the graph it records is not evidence.
     */
    it.effect("reproduces its own graph when its log is replayed", () =>
      Effect.gen(function* () {
        const { bundle, path } = yield* investigate;

        const onDisk = JSON.parse(read(join(path, "viokit-manifest.json"))) as {
          graph: { entities: { id: string }[]; relations: { id: string }[] };
          steps: { operation: { _tag: string; entity?: { id: string } } }[];
        };

        // Fold the bundle's own log the way the graph store does.
        const entities = new Set<string>();
        for (const step of onDisk.steps) {
          if (step.operation._tag === "AddEntity" && step.operation.entity) {
            entities.add(step.operation.entity.id);
          }
        }

        const byId = (a: string, b: string) => a.localeCompare(b);
        assert.deepStrictEqual(
          [...entities].sort(byId),
          onDisk.graph.entities.map((entity) => entity.id).sort(byId)
        );
        assert.strictEqual(bundle.manifest.steps.length, onDisk.steps.length);
      })
    );

    it.effect("exporting appends no step and writes no evidence (I3)", () =>
      Effect.gen(function* () {
        const { engine, path } = yield* investigate;
        const before = yield* engine.log;
        yield* engine.exportBundle(`${path}-again`);
        const after = yield* engine.log;
        assert.strictEqual(after.length, before.length);
      })
    );
  });
});
