import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, layer } from "@effect/vitest";
import { Engine, EngineLayer } from "@viokit/engine";
import {
  SourceError,
  SourceSpec,
  SourceTransportService,
} from "@viokit/schema";
import { Effect, Layer } from "effect";
import { EvidenceBackendMemory } from "../src/evidence-fs.js";
import { OntologyRegistryLayer } from "../src/ontology.js";
import { makeViewStateLayer } from "../src/view-state.js";

/** A throwaway view-state root per run: the store is a deployment input. */
const tempViewState = () =>
  makeViewStateLayer(mkdtempSync(join(tmpdir(), "viokit-vs-")));

/**
 * P1 exit proof (task 5.2): both an HTTP source and a dataset source execute
 * end-to-end through `SourceRuntime.run` (via `Engine.acquire`) into
 * `EvidenceInput` with a live acquisition path. A dispatcher routes each
 * source to the transport matching its `transport` tag, exercising the real
 * dataset transport (local file read).
 */
const dispatchTransport = Layer.succeed(SourceTransportService, {
  fetch: (source) =>
    source.transport === "dataset"
      ? Effect.tryPromise({
          catch: () =>
            SourceError.make({
              message: `failed to read dataset ${source.url}`,
            }),
          try: () =>
            import("node:fs/promises").then(({ readFile }) =>
              readFile(source.url)
            ),
        }).pipe(
          Effect.map((bytes) => ({
            bytes,
            contentType: "application/octet-stream",
          }))
        )
      : Effect.succeed({
          bytes: new TextEncoder().encode("http-bytes"),
          contentType: "application/octet-stream",
        }),
});

const exitProofLayer = Layer.provide(
  EngineLayer,
  Layer.mergeAll(
    EvidenceBackendMemory,
    dispatchTransport,
    OntologyRegistryLayer,
    tempViewState()
  )
);

const httpSource = SourceSpec.make({
  id: "http-s1",
  transport: "http",
  url: "https://example.com/artefact",
});

const datasetSource = SourceSpec.make({
  id: "dataset-d1",
  transport: "dataset",
  url: new URL("../../sources/test/fixtures/sample.csv", import.meta.url)
    .pathname,
});

describe("P1 exit proof: two transports through the one pipeline", () => {
  layer(exitProofLayer)((it) => {
    it.effect("acquires an HTTP source into evidence", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const evidence = yield* engine.acquire(httpSource);
        assert.strictEqual(evidence.acquisitionPath._tag, "live");
        assert.strictEqual(
          new TextDecoder().decode(evidence.bytes),
          "http-bytes"
        );
      })
    );

    it.effect("acquires a dataset source into evidence", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const evidence = yield* engine.acquire(datasetSource);
        assert.strictEqual(evidence.acquisitionPath._tag, "live");
        const text = new TextDecoder().decode(evidence.bytes);
        assert.isTrue(text.includes("alice"));
      })
    );
  });
});
