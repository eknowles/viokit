import type { RateLimitPolicy } from "@viokit/schema";
import { RateLimited } from "@viokit/schema";
import { Clock, Context, Effect, Layer } from "effect";

/** A token-bucket rate limiter keyed by source id (task 4.2). */
export interface RateLimiter {
  readonly acquire: (
    sourceId: string,
    policy: RateLimitPolicy
  ) => Effect.Effect<void, RateLimited>;
}

/**
 * In-memory token-bucket rate limiter (per source id). Tokens refill at
 * `refillPerSecond` up to `capacity`; an acquisition that finds no token fails
 * with a typed `RateLimited`. Counters do not survive a process restart (deferred
 * persistent limiting, per design).
 */
export class RateLimiterService extends Context.Service<
  RateLimiterService,
  RateLimiter
>()("RateLimiterService", {
  make: Effect.gen(function* () {
    const clock = yield* Clock.Clock;
    const buckets = new Map<
      string,
      { capacity: number; tokens: number; lastRefill: number }
    >();

    const bucketFor = (
      sourceId: string,
      policy: RateLimitPolicy
    ): { capacity: number; tokens: number; lastRefill: number } => {
      const existing = buckets.get(sourceId);
      if (existing !== undefined) {
        return existing;
      }
      const bucket = {
        capacity: policy.capacity,
        lastRefill: 0,
        tokens: policy.capacity,
      };
      buckets.set(sourceId, bucket);
      return bucket;
    };

    return {
      acquire: (sourceId, policy) =>
        Effect.gen(function* () {
          const bucket = bucketFor(sourceId, policy);
          const now = yield* clock.currentTimeMillis;
          const elapsedSeconds = (now - bucket.lastRefill) / 1000;
          const refilled = Math.min(
            bucket.capacity,
            bucket.tokens + elapsedSeconds * policy.refillPerSecond
          );
          bucket.tokens = refilled;
          bucket.lastRefill = now;
          if (refilled < 1) {
            return yield* RateLimited.make({
              message: `rate limit exceeded for source ${sourceId}`,
            });
          }
          bucket.tokens -= 1;
        }),
    };
  }),
}) {}

export const RateLimiterLayer = Layer.effect(
  RateLimiterService,
  RateLimiterService.make
);
