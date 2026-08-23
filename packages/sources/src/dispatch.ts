import { SourceError, SourceTransportService } from "@viokit/schema";
import { Effect, Layer, Option } from "effect";
import {
  BrowserEngineService,
  defaultBrowserProfileRoot,
  makeBrowserTransport,
} from "./browser.js";
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
    // Present only where a deployment wires a browser engine; otherwise browser
    // sources stay blocked, which is the honest answer rather than a failure at
    // acquisition time.
    const engine = Option.getOrUndefined(
      yield* Effect.serviceOption(BrowserEngineService)
    );
    const browser =
      engine === undefined
        ? undefined
        : makeBrowserTransport(engine, {
            profileRoot: defaultBrowserProfileRoot,
          });

    return {
      fetch: (source, context) => {
        if (source.transport === "browser") {
          if (browser === undefined) {
            return SourceError.make({
              message: `source '${source.id}' needs a browser transport, which this deployment does not provide`,
            });
          }
          return browser.fetch(source, context);
        }
        return source.transport === "dataset"
          ? dataset.fetch(source, context)
          : http.fetch(source, context);
      },
    };
  })
);
