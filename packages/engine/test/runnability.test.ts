import { assert, describe, it } from "@effect/vitest";
import {
  SourceAuth,
  SourceRuntimeService,
  SourceSpec,
  SourceTransportService,
  TransportCapabilities,
  type TransportKind,
} from "@viokit/schema";
import { Effect, Layer } from "effect";
import { CacheLayer } from "../src/cache.js";
import { EgressLayer } from "../src/egress.js";
import { RateLimiterLayer } from "../src/rate-limit.js";
import { SourceRuntimeLayer } from "../src/source-runtime.js";

const text = (value: string): Uint8Array => new TextEncoder().encode(value);

/** Records every transport call, so "no request was attempted" is assertable. */
const countingTransport = (calls: string[]) =>
  Layer.succeed(SourceTransportService, {
    fetch: (fetched) =>
      Effect.sync(() => {
        calls.push(fetched.id);
        return { bytes: text("body"), contentType: "text/plain" };
      }),
  });

const runtime = (calls: string[], capabilities?: readonly TransportKind[]) => {
  const base = SourceRuntimeLayer.pipe(
    Layer.provide(countingTransport(calls)),
    Layer.provide(CacheLayer),
    Layer.provide(EgressLayer),
    Layer.provide(RateLimiterLayer)
  );
  return capabilities === undefined
    ? base
    : Layer.provide(base, Layer.succeed(TransportCapabilities, capabilities));
};

const run = <A, E>(
  effect: Effect.Effect<A, E, SourceRuntimeService>,
  layer: Layer.Layer<SourceRuntimeService, never, never>
) => Effect.runPromise(Effect.result(effect.pipe(Effect.provide(layer))));

const source = (access: SourceSpec["access"], auth?: SourceAuth): SourceSpec =>
  SourceSpec.make({
    access,
    id: `src-${access}`,
    transport: "http",
    url: "https://x.test",
    ...(auth === undefined ? {} : { auth }),
  });

const acquire = (spec: SourceSpec) =>
  Effect.gen(function* () {
    const rt = yield* SourceRuntimeService;
    return yield* rt.run(spec);
  });

describe("the runtime refuses sources this deployment cannot run", () => {
  it("refuses a browser-only source and attempts no transport call", async () => {
    const calls: string[] = [];
    const result = await run(acquire(source("browser_scrape")), runtime(calls));

    assert.strictEqual(result._tag, "Failure");
    if (result._tag === "Failure") {
      assert.strictEqual(
        (result.failure as { _tag: string })._tag,
        "SourceNotRunnable"
      );
      assert.include(
        (result.failure as { message: string }).message,
        "browser"
      );
    }
    assert.deepStrictEqual(calls, []);
  });

  it("refuses a credential-gated source with no credentials", async () => {
    const calls: string[] = [];
    const result = await run(acquire(source("requires_key")), runtime(calls));

    assert.strictEqual(result._tag, "Failure");
    if (result._tag === "Failure") {
      assert.include(
        (result.failure as { message: string }).message,
        "credentials"
      );
    }
    assert.deepStrictEqual(calls, []);
  });

  it("acquires a credential-gated source once credentials are configured", async () => {
    const calls: string[] = [];
    const result = await run(
      acquire(source("requires_key", SourceAuth.make({ apiKey: "k" }))),
      runtime(calls)
    );

    assert.strictEqual(result._tag, "Success");
    assert.deepStrictEqual(calls, ["src-requires_key"]);
  });

  it("acquires a browser-only source where a browser transport is declared", async () => {
    const calls: string[] = [];
    const result = await run(
      acquire(source("browser_scrape")),
      runtime(calls, ["http", "dataset", "browser"])
    );

    assert.strictEqual(result._tag, "Success");
    assert.deepStrictEqual(calls, ["src-browser_scrape"]);
  });

  it("leaves runnable and unclassified sources unaffected", async () => {
    const calls: string[] = [];
    const open = await run(acquire(source("open_api")), runtime(calls));
    const unknown = await run(acquire(source("unknown")), runtime(calls));

    assert.strictEqual(open._tag, "Success");
    assert.strictEqual(unknown._tag, "Success");
    assert.deepStrictEqual(calls, ["src-open_api", "src-unknown"]);
  });
});
