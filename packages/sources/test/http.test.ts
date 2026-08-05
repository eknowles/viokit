import { assert, describe, layer } from "@effect/vitest";
import { SourceRuntimeService, SourceSpec } from "@viokit/schema";
import { Effect, Layer } from "effect";
import { Http, sourceRuntimeLayer } from "../src/http.js";

const fakeHttp = Layer.succeed(Http, {
  getBytes: () => Effect.succeed(new Uint8Array([10, 20, 30])),
});

const testSourceLayer = sourceRuntimeLayer(fakeHttp);

const source = SourceSpec.make({
  id: "s1",
  transport: "http",
  url: "https://example.com/artefact",
});

describe("http source runtime", () => {
  layer(testSourceLayer)((it) => {
    it.effect("produces evidence input with a live acquisition path", () =>
      Effect.gen(function* () {
        const runtime = yield* SourceRuntimeService;
        const input = yield* runtime.run(source);
        assert.deepEqual(Array.from(input.bytes), [10, 20, 30]);
        assert.strictEqual(input.acquisitionPath._tag, "live");
      })
    );

    it.effect("records acquiredAt and observedAt", () =>
      Effect.gen(function* () {
        const runtime = yield* SourceRuntimeService;
        const input = yield* runtime.run(source);
        assert.strictEqual(
          input.acquiredAt.getTime(),
          input.observedAt.getTime()
        );
      })
    );
  });
});
