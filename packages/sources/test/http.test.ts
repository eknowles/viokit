import { assert, describe, layer } from "@effect/vitest";
import { SourceSpec, SourceTransportService } from "@viokit/schema";
import { Effect, Layer } from "effect";
import { HttpTransportLayer } from "../src/http.js";

const fakeHttp = Layer.succeed(SourceTransportService, {
  fetch: () =>
    Effect.succeed({
      bytes: new Uint8Array([10, 20, 30]),
      contentType: "application/octet-stream",
    }),
});

const testLayer = Layer.merge(HttpTransportLayer, fakeHttp);

const source = SourceSpec.make({
  id: "s1",
  transport: "http",
  url: "https://example.com/artefact",
});

describe("http transport", () => {
  layer(testLayer)((it) => {
    it.effect("produces raw response bytes", () =>
      Effect.gen(function* () {
        const transport = yield* SourceTransportService;
        const result = yield* transport.fetch(source);
        assert.deepEqual(Array.from(result.bytes), [10, 20, 30]);
      })
    );
  });
});
