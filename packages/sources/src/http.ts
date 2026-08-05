import {
  EvidenceInput,
  Live,
  SourceError,
  SourceRuntimeService,
} from "@viokit/schema";
import { Clock, Context, DateTime, Effect, Layer, Stream } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
} from "effect/unstable/http";

export class Http extends Context.Service<
  Http,
  {
    readonly getBytes: (url: string) => Effect.Effect<Uint8Array, SourceError>;
  }
>()("Http") {}

export const HttpLive = Layer.effect(
  Http,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return {
      getBytes: (url) =>
        HttpClientResponse.stream(HttpClient.get(url)).pipe(
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
            return bytes;
          }),
          Effect.mapError((error) =>
            SourceError.make({ message: error.message })
          )
        ),
    };
  })
).pipe(Layer.provide(FetchHttpClient.layer));

export const sourceRuntimeLayer = (
  httpLayer: Layer.Layer<Http>
): Layer.Layer<SourceRuntimeService, never, never> =>
  Layer.effect(
    SourceRuntimeService,
    Effect.gen(function* () {
      const http = yield* Http;
      return {
        run: (source) =>
          Effect.gen(function* () {
            const nowMillis = yield* Clock.currentTimeMillis;
            const timestamp = DateTime.toDateUtc(
              DateTime.makeUnsafe(nowMillis)
            );
            const bytes = yield* http.getBytes(source.url);
            return EvidenceInput.make({
              acquiredAt: timestamp,
              acquisitionPath: Live.make({}),
              bytes,
              contentType: "application/octet-stream",
              observedAt: timestamp,
            });
          }),
      };
    })
  ).pipe(Layer.provide(httpLayer));

export const HttpSourceLayer: Layer.Layer<SourceRuntimeService, never, never> =
  sourceRuntimeLayer(HttpLive);
