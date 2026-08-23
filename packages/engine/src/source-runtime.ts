import type {
  AcquisitionPath,
  EvidenceInput,
  SourceError,
  SourceSpec,
  SourceTransport,
  TransportResult,
} from "@viokit/schema";
import {
  AcqProxy,
  Cache,
  defaultTransportCapabilities,
  type EgressDisabledError,
  Live,
  OfflineCacheMiss,
  type RateLimited,
  RetryExhausted,
  runnabilityOf,
  SourceNotRunnable,
  SourceRuntimeService,
  SourceTransportService,
  TransportCapabilities,
} from "@viokit/schema";
import { Clock, Duration, Effect, Layer, Option, Schedule } from "effect";
import type { CacheStore } from "./cache.js";
import {
  CacheService,
  evaluateCacheRead,
  requestFingerprint,
} from "./cache.js";
import { type Egress, type EgressDecision, EgressService } from "./egress.js";
import { type RateLimiter, RateLimiterService } from "./rate-limit.js";

/**
 * The full acquisition pipeline (task 4.3): decode spec → retry → rate-limit →
 * cache read-through → egress → decode/project → `EvidenceInput`. The seam
 * outward shape stays `Effect<EvidenceInput, SourceError>`; typed policy errors
 * flow through the widened error channel (task 1.4).
 */

/** Retry a transport fetch with exponential backoff + jitter (task 4.1). */
const retryFetch = (
  source: SourceSpec,
  fetch: Effect.Effect<TransportResult, SourceError>
): Effect.Effect<TransportResult, SourceError | RetryExhausted> => {
  const policy = source.retry;
  if (policy === undefined || policy.maxAttempts <= 1) {
    return fetch;
  }
  const schedule = Schedule.exponential(
    Duration.millis(policy.baseDelayMs),
    policy.factor
  ).pipe(Schedule.jittered);
  return Effect.retry(fetch, {
    schedule,
    times: policy.maxAttempts - 1,
  }).pipe(
    Effect.catchTag("SourceError", () =>
      RetryExhausted.make({
        message: `retries exhausted for source ${source.id}`,
      })
    )
  );
};

const toEvidenceInput = (
  result: TransportResult,
  acquisitionPath: AcquisitionPath,
  now: number
): EvidenceInput => {
  const timestamp = new Date(now);
  return {
    acquiredAt: timestamp,
    acquisitionPath,
    bytes: result.bytes,
    contentType: result.contentType,
    observedAt: timestamp,
  };
};

const decisionAcquisitionPath = (decision: EgressDecision): AcquisitionPath =>
  decision.path === "proxy"
    ? AcqProxy.make({ ref: decision.viaProxy ?? "" })
    : Live.make({});

/** Apply the same defaults the schema guarantees at construction/decode time. */
const cachePolicyOf = (
  source: SourceSpec
): import("@viokit/schema").CachePolicy =>
  source.cache ?? {
    maxStaleMs: 0,
    mode: "live-only",
    ttlMs: 0,
  };

const egressPolicyOf = (
  source: SourceSpec
): import("@viokit/schema").EgressPolicy => source.egress ?? { _tag: "direct" };

/** Rate-limit → egress → transport fetch → optional cache write-back. */
const egressPath = (
  source: SourceSpec,
  cache: CacheStore,
  egress: Egress,
  rateLimiter: RateLimiter,
  transport: SourceTransport,
  fingerprint: string,
  now: number,
  policy: import("@viokit/schema").CachePolicy
): Effect.Effect<
  EvidenceInput,
  SourceError | RetryExhausted | RateLimited | EgressDisabledError
> =>
  Effect.gen(function* () {
    if (source.rateLimit !== undefined) {
      yield* rateLimiter.acquire(source.id, source.rateLimit);
    }

    const decision = yield* egress.resolve(egressPolicyOf(source));

    const fetched = yield* retryFetch(source, transport.fetch(source));

    const input = toEvidenceInput(
      fetched,
      decisionAcquisitionPath(decision),
      now
    );

    if (policy.mode === "refresh" || policy.mode === "cache-first") {
      yield* cache.put(fingerprint, {
        bytes: fetched.bytes,
        contentType: fetched.contentType,
        createdAt: now,
        expiresAt: now + (policy.ttlMs ?? 0),
        maxStaleUntil: now + (policy.ttlMs ?? 0) + (policy.maxStaleMs ?? 0),
      });
    }

    return input;
  });

/**
 * The default runtime: composes cache + egress + rate-limit + transport into a
 * `SourceRuntimeService`. Provided by the engine so the pipeline is runtime-owned
 * (I4/I10); transports come from the `sources` package behind the
 * `SourceTransportService` seam.
 */
export const SourceRuntimeLayer: Layer.Layer<
  SourceRuntimeService,
  never,
  CacheService | EgressService | RateLimiterService | SourceTransportService
> = Layer.effect(
  SourceRuntimeService,
  Effect.gen(function* () {
    const cache = yield* CacheService;
    const egress = yield* EgressService;
    const rateLimiter = yield* RateLimiterService;
    const transport = yield* SourceTransportService;
    const clock = yield* Clock.Clock;
    const capabilities = Option.getOrElse(
      yield* Effect.serviceOption(TransportCapabilities),
      () => defaultTransportCapabilities
    );

    return {
      run: (source) =>
        Effect.gen(function* () {
          // Runnability is acquisition policy, so it is decided here and not by
          // a transform or a front-end (I4/I10) — and decided *before* any
          // transport call, so a browser-only source yields its reason rather
          // than a network error that looks like a bug.
          const runnable = runnabilityOf(source, capabilities);
          if (!runnable.runnable) {
            return yield* SourceNotRunnable.make({
              message: `source '${source.id}' cannot be acquired here: ${runnable.reason ?? "unknown reason"}`,
            });
          }

          const now = yield* clock.currentTimeMillis;
          const fingerprint = requestFingerprint(source);
          const policy = cachePolicyOf(source);

          if (policy.mode === "live-only") {
            // live-only never touches the cache (task 4.4).
            return yield* egressPath(
              source,
              cache,
              egress,
              rateLimiter,
              transport,
              fingerprint,
              now,
              policy
            );
          }

          const cacheRead = yield* cache.get(fingerprint);
          const verdict = evaluateCacheRead(policy, cacheRead, now);

          if (
            (policy.mode === "cache-first" || policy.mode === "cache-only") &&
            (verdict.kind === "fresh" ||
              verdict.kind === "stale-within-max-stale")
          ) {
            return toEvidenceInput(
              {
                bytes: verdict.entry.bytes,
                contentType: verdict.entry.contentType,
              },
              Cache.make({ ref: fingerprint }),
              now
            );
          }

          if (policy.mode === "cache-only") {
            // cache-only performs no egress (I11); a miss is a typed offline miss.
            return yield* OfflineCacheMiss.make({
              message: `no usable cache entry for source ${source.id}`,
            });
          }

          // refresh, or cache-first miss → egress path.
          return yield* egressPath(
            source,
            cache,
            egress,
            rateLimiter,
            transport,
            fingerprint,
            now,
            policy
          );
        }),
    };
  })
);
