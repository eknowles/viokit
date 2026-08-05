import { assert, describe, layer } from "@effect/vitest";
import { SourceSpec, SourceTransportService } from "@viokit/schema";
import { Effect } from "effect";
import { DatasetTransportLayer } from "../src/dataset.js";

const testLayer = DatasetTransportLayer;

const source = SourceSpec.make({
  id: "d1",
  transport: "dataset",
  url: new URL("./fixtures/sample.csv", import.meta.url).pathname,
});

describe("dataset transport", () => {
  layer(testLayer)((it) => {
    it.effect("reads a local file into raw bytes", () =>
      Effect.gen(function* () {
        const transport = yield* SourceTransportService;
        const result = yield* transport.fetch(source);
        const text = new TextDecoder().decode(result.bytes);
        assert.isTrue(text.includes("id"));
        assert.strictEqual(result.contentType, "application/octet-stream");
      })
    );
  });
});
