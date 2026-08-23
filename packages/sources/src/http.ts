import type { ResolvedCredential } from "@viokit/schema";
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
/**
 * Apply a credential the runtime resolved. The transport never resolves — it
 * receives a value or nothing (I4/I10) — and applies it as the source's spec
 * declared: a bearer token, a named header, or a query parameter.
 */
const credentialHeaders = (
  credential: ResolvedCredential | undefined
): Record<string, string> => {
  if (credential === undefined) {
    return {};
  }
  if (credential.scheme === "bearer") {
    return { authorization: `Bearer ${credential.value}` };
  }
  if (credential.scheme === "header") {
    return { [credential.name ?? "authorization"]: credential.value };
  }
  return {};
};

const withCredential = (
  url: string,
  credential: ResolvedCredential | undefined
): string => {
  if (credential === undefined || credential.scheme !== "query") {
    return url;
  }
  const parsed = new URL(url);
  parsed.searchParams.set(credential.name ?? "key", credential.value);
  return parsed.toString();
};

export const HttpTransportLayer: Layer.Layer<
  SourceTransportService,
  never,
  never
> = Layer.effect(
  SourceTransportService,
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    return {
      fetch: (source, context) =>
        HttpClientResponse.stream(
          HttpClient.get(withCredential(source.url, context?.credential), {
            headers: credentialHeaders(context?.credential),
          })
        ).pipe(
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
