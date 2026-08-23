import type { ResolvedCredential, TransportResult } from "@viokit/schema";
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

/**
 * What the response actually was. The status and content type used to be
 * discarded here — every artifact was recorded as `application/octet-stream`,
 * and a `401` was indistinguishable from a `200`, because Effect's `HttpClient`
 * does not fail on a 4xx. Both are load-bearing: evidence should say what it
 * holds, and a credential wall is only detectable from the status.
 */
const collect = (
  chunks: readonly Uint8Array[],
  response: {
    readonly headers: Record<string, string | undefined>;
    readonly status: number;
  }
): TransportResult => {
  const bytes = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.byteLength, 0)
  );
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const declared = response.headers["content-type"];
  return {
    bytes,
    // A response that declares nothing is unspecified bytes — which is what
    // this value should always have meant.
    contentType:
      declared === undefined || declared === ""
        ? "application/octet-stream"
        : declared,
    status: response.status,
  };
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
        HttpClient.get(withCredential(source.url, context?.credential), {
          headers: credentialHeaders(context?.credential),
        }).pipe(
          Effect.provideService(HttpClient.HttpClient, client),
          Effect.flatMap((response) =>
            HttpClientResponse.stream(Effect.succeed(response)).pipe(
              Stream.runCollect,
              Effect.map((chunks) => collect(chunks, response))
            )
          ),
          Effect.mapError((error) =>
            SourceError.make({ message: error.message })
          )
        ),
    };
  })
).pipe(Layer.provide(FetchHttpClient.layer));
