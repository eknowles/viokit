import { SourceTransportService } from "@viokit/schema";
import { Effect, Layer } from "effect";
import { DatasetTransportLayer } from "./dataset.js";
import { HttpTransportLayer } from "./http.js";

/**
 * Routes an acquisition to the transport its `SourceSpec` declares. A
 * deployment that registers packs of mixed transports needs one
 * `SourceTransportService`, not a choice made per call site; the acquisition
 * pipeline (retry/rate-limit/cache/egress) stays owned by the engine's
 * `SourceRuntimeLayer` either way (I4/I10).
 */
export const DispatchTransportLayer: Layer.Layer<
  SourceTransportService,
  never,
  never
> = Layer.effect(
  SourceTransportService,
  Effect.gen(function* () {
    const http = yield* Effect.provide(
      Effect.gen(function* () {
        return yield* SourceTransportService;
      }),
      HttpTransportLayer
    );
    const dataset = yield* Effect.provide(
      Effect.gen(function* () {
        return yield* SourceTransportService;
      }),
      DatasetTransportLayer
    );

    return {
      fetch: (source, credential) =>
        source.transport === "dataset"
          ? dataset.fetch(source, credential)
          : http.fetch(source, credential),
    };
  })
);
