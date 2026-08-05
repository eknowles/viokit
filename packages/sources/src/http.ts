import { SourceError, SourceTransportService } from "@viokit/schema";
import { Effect, Layer, Stream } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
} from "effect/unstable/http";

/**
 * The `transport: "http"` producer (task 4.5). Behind the `SourceTransportService`
 * seam: it turns a source into raw response bytes. The acquisition pipeline
 * (retry/rate-limit/cache/egress) is owned by the engine's `SourceRuntimeLayer`,
 * so this layer provides only the transport.
 */
export const HttpTransportLayer: Layer.Layer<
  SourceTransportService,
  never,
  never
> = Layer.effect(
  SourceTransportService,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return {
      fetch: (source) =>
        HttpClientResponse.stream(HttpClient.get(source.url)).pipe(
          Stream.provideService(HttpClient.HttpClient, client),
          Stream.runCollect,
          Effect.map((chunks) => {
            const bytes = new Uint8Array(
              chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
            );
            let offset = 0;
            for (const chunk of chunks) {
              bytes.set(chunk, offset);
              offset += chunk.byteLength;
            }
            return { bytes, contentType: "application/octet-stream" };
          }),
          Effect.mapError((error) =>
            SourceError.make({ message: error.message })
          )
        ),
    };
  })
).pipe(Layer.provide(FetchHttpClient.layer));
