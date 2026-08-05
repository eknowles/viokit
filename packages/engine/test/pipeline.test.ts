import { assert, describe, it, layer } from "@effect/vitest";
import {
  CachePolicy,
  RateLimitPolicy,
  RetryPolicy,
  SourceError,
  SourceRuntimeService,
  SourceSpec,
  SourceTransportService,
} from "@viokit/schema";
import { Effect, Layer, Result } from "effect";
import { CacheLayer } from "../src/cache.js";
import { EgressLayer } from "../src/egress.js";
import { RateLimiterLayer } from "../src/rate-limit.js";
import { SourceRuntimeLayer } from "../src/source-runtime.js";

const base = { transport: "http" as const, url: "https://example.com/a" };

const okResult = {
  bytes: new Uint8Array([1]),
  contentType: "application/octet-stream",
};

/** A transport that fails the first `failTimes` calls, then succeeds. */
const failTransport = (
  failTimes: number
): Layer.Layer<SourceTransportService> =>
  Layer.succeed(SourceTransportService, {
    fetch: () => {
      let calls = 0;
      return Effect.gen(function* () {
        calls += 1;
        if (calls <= failTimes) {
          return yield* Effect.fail(SourceError.make({ message: "transient" }));
        }
        return okResult;
      });
    },
  });

const pipelineWith = (
  transport: Layer.Layer<SourceTransportService>
): Layer.Layer<SourceRuntimeService> =>
  Layer.provide(
    SourceRuntimeLayer,
    Layer.mergeAll(CacheLayer, EgressLayer, RateLimiterLayer, transport)
  );

describe("runtime pipeline (task 4.x)", () => {
  describe("retry/backoff (4.1)", () => {
    it.live("succeeds after transient failures within budget", () =>
      Effect.provide(
        Effect.gen(function* () {
          const runtime = yield* SourceRuntimeService;
          const source = SourceSpec.make({
            ...base,
            id: "retry-ok",
            retry: RetryPolicy.make({
              baseDelayMs: 1,
              factor: 1,
              maxAttempts: 3,
            }),
          });
          const input = yield* runtime.run(source);
          assert.deepEqual(Array.from(input.bytes), [1]);
          assert.strictEqual(input.acquisitionPath._tag, "live");
        }),
        pipelineWith(failTransport(2))
      )
    );

    it.live("surfaces RetryExhausted when the budget is exceeded", () =>
      Effect.provide(
        Effect.gen(function* () {
          const runtime = yield* SourceRuntimeService;
          const source = SourceSpec.make({
            ...base,
            id: "retry-exhausted",
            retry: RetryPolicy.make({
              baseDelayMs: 1,
              factor: 1,
              maxAttempts: 2,
            }),
          });
          const result = yield* runtime.run(source).pipe(Effect.result);
          assert.isTrue(Result.isFailure(result));
        }),
        pipelineWith(failTransport(5))
      )
    );
  });

  describe("rate-limit (4.2)", () => {
    layer(
      pipelineWith(
        Layer.succeed(SourceTransportService, {
          fetch: () => Effect.succeed(okResult),
        })
      )
    )((t) => {
      t.effect("fails with RateLimited when the budget is exhausted", () =>
        Effect.gen(function* () {
          const runtime = yield* SourceRuntimeService;
          const source = SourceSpec.make({
            ...base,
            id: "limited",
            rateLimit: RateLimitPolicy.make({
              capacity: 0,
              refillPerSecond: 0,
            }),
          });
          const result = yield* runtime.run(source).pipe(Effect.result);
          assert.isTrue(Result.isFailure(result));
        })
      );
    });
  });

  describe("cache-only offline miss (4.4)", () => {
    layer(
      pipelineWith(
        Layer.succeed(SourceTransportService, {
          fetch: () => Effect.succeed(okResult),
        })
      )
    )((t) => {
      t.effect("returns OfflineCacheMiss without egress", () =>
        Effect.gen(function* () {
          const runtime = yield* SourceRuntimeService;
          const source = SourceSpec.make({
            ...base,
            cache: CachePolicy.make({
              maxStaleMs: 0,
              mode: "cache-only",
              ttlMs: 0,
            }),
            id: "offline",
          });
          const result = yield* runtime.run(source).pipe(Effect.result);
          assert.isTrue(Result.isFailure(result));
        })
      );
    });
  });
});
