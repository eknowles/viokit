import { assert, describe, it } from "@effect/vitest";
import type { ResolvedCredential } from "@viokit/schema";
import { SourceSpec, SourceTransportService } from "@viokit/schema";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpTransportLayer } from "../src/http.js";

const SECRET = "s3cr3t";

const spec = SourceSpec.make({
  id: "s",
  transport: "http",
  url: "https://api.test/data?q=1",
});

/**
 * The transport builds the outbound request; capturing `fetch` is how we assert
 * the credential landed where the spec declared, without a network.
 */
const captured: Request[] = [];

const stubFetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  captured.push(
    input instanceof Request ? input : new Request(String(input), init)
  );
  return Promise.resolve(new Response("payload", { status: 200 }));
}) as typeof globalThis.fetch;

const layer = HttpTransportLayer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stubFetch))
);

const fetchWith = (credential: ResolvedCredential | undefined) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const transport = yield* SourceTransportService;
      return yield* transport.fetch(spec, credential);
    }).pipe(Effect.provide(layer))
  );

const lastRequest = (): Request => {
  const request = captured.at(-1);
  if (request === undefined) {
    throw new Error("no request captured");
  }
  return request;
};

describe("the HTTP transport applies a resolved credential", () => {
  it("sends a bearer token in the authorization header", async () => {
    await fetchWith({ name: undefined, scheme: "bearer", value: SECRET });
    assert.strictEqual(
      lastRequest().headers.get("authorization"),
      `Bearer ${SECRET}`
    );
  });

  it("sends a named header credential under that name", async () => {
    await fetchWith({ name: "x-api-key", scheme: "header", value: SECRET });
    assert.strictEqual(lastRequest().headers.get("x-api-key"), SECRET);
  });

  it("appends a query credential, preserving existing parameters", async () => {
    await fetchWith({ name: "api_key", scheme: "query", value: SECRET });
    const url = new URL(lastRequest().url);
    assert.strictEqual(url.searchParams.get("api_key"), SECRET);
    assert.strictEqual(url.searchParams.get("q"), "1");
  });

  it("sends nothing extra when there is no credential", async () => {
    await fetchWith(undefined);
    const request = lastRequest();
    assert.isNull(request.headers.get("authorization"));
    assert.isNull(new URL(request.url).searchParams.get("api_key"));
  });
});
