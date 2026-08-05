import { assert, describe, it } from "@effect/vitest";
import type { CachePolicy } from "@viokit/schema";
import { SourceSpec } from "@viokit/schema";
import { Effect, Option } from "effect";
import type { CacheEntry } from "../src/cache.js";
import {
  evaluateCacheRead,
  makeFileCacheStore,
  makeMemoryCacheStore,
  requestFingerprint,
} from "../src/cache.js";

const entry = (overrides: Partial<CacheEntry> = {}): CacheEntry => ({
  bytes: new Uint8Array([1, 2, 3]),
  contentType: "application/octet-stream",
  createdAt: 1000,
  expiresAt: 2000,
  maxStaleUntil: 3000,
  ...overrides,
});

describe("request fingerprint", () => {
  it("strips credentials so same-source requests collide", () => {
    const base = {
      id: "s1",
      transport: "http" as const,
      url: "https://example.com/a",
    };
    const authed = SourceSpec.make({
      ...base,
      auth: { apiKey: "secret" },
    });
    const plain = SourceSpec.make({ ...base });
    assert.strictEqual(requestFingerprint(authed), requestFingerprint(plain));
  });

  it("differs across sources", () => {
    const a = SourceSpec.make({ id: "a", transport: "http", url: "u" });
    const b = SourceSpec.make({ id: "b", transport: "http", url: "u" });
    assert.notStrictEqual(requestFingerprint(a), requestFingerprint(b));
  });
});

describe("evaluateCacheRead (task 2.6)", () => {
  const liveOnly: CachePolicy = {
    maxStaleMs: 1000,
    mode: "live-only",
    ttlMs: 1000,
  };
  const cacheFirst: CachePolicy = {
    maxStaleMs: 1000,
    mode: "cache-first",
    ttlMs: 1000,
  };
  const cacheOnly: CachePolicy = {
    maxStaleMs: 1000,
    mode: "cache-only",
    ttlMs: 1000,
  };
  const refresh: CachePolicy = {
    maxStaleMs: 1000,
    mode: "refresh",
    ttlMs: 1000,
  };

  it("live-only never serves from cache", () => {
    assert.strictEqual(
      evaluateCacheRead(liveOnly, Option.some(entry()), 1500).kind,
      "stale"
    );
  });

  it("refresh ignores the cache", () => {
    assert.strictEqual(
      evaluateCacheRead(refresh, Option.some(entry()), 1500).kind,
      "stale"
    );
  });

  it("cache-first serves fresh entries", () => {
    const verdict = evaluateCacheRead(cacheFirst, Option.some(entry()), 1500);
    assert.strictEqual(verdict.kind, "fresh");
  });

  it("cache-first serves stale-within-max-stale", () => {
    // createdAt 0 + ttl 1000 + maxStale 1000 => usable until 2000; now 1500.
    const verdict = evaluateCacheRead(
      cacheFirst,
      Option.some(entry({ createdAt: 0 })),
      1500
    );
    assert.strictEqual(verdict.kind, "stale-within-max-stale");
  });

  it("cache-first misses on fully stale entries", () => {
    // createdAt 0 + ttl 1000 + maxStale 1000 => usable until 2000; now 9000.
    const verdict = evaluateCacheRead(
      cacheFirst,
      Option.some(entry({ createdAt: 0 })),
      9000
    );
    assert.strictEqual(verdict.kind, "stale");
  });

  it("cache-only misses when no entry", () => {
    assert.strictEqual(
      evaluateCacheRead(cacheOnly, Option.none(), 1500).kind,
      "stale"
    );
  });
});

describe("memory cache store (task 2.2)", () => {
  it.effect("round-trips a put/get", () =>
    Effect.gen(function* () {
      const store = makeMemoryCacheStore();
      const fp = "abc";
      const item = entry();
      yield* store.put(fp, item);
      const got = yield* store.get(fp);
      if (Option.isNone(got)) {
        assert.fail("expected a cache hit");
        return;
      }
      assert.deepEqual(Array.from(got.value.bytes), [1, 2, 3]);
    })
  );

  it.effect("returns none for a miss", () =>
    Effect.gen(function* () {
      const store = makeMemoryCacheStore();
      const got = yield* store.get("missing");
      assert.isTrue(Option.isNone(got));
    })
  );

  it.effect("evicts least-recently-used beyond capacity", () =>
    Effect.gen(function* () {
      const store = makeMemoryCacheStore(2);
      yield* store.put("k1", entry());
      yield* store.put("k2", entry());
      yield* store.get("k1");
      yield* store.put("k3", entry());
      const k2 = yield* store.get("k2");
      const k1 = yield* store.get("k1");
      assert.isTrue(Option.isNone(k2));
      assert.isTrue(Option.isSome(k1));
    })
  );
});

describe("filesystem cache store (task 2.3)", () => {
  const mkIo = () => {
    const files = new Map<string, string>();
    return {
      files,
      io: {
        exists: async (path: string) => files.has(path),
        makeDirectory: async () => {
          await Promise.resolve();
        },
        readFile: async (path: string) =>
          new TextEncoder().encode(files.get(path) ?? ""),
        writeFileExclusive: async (path: string, data: Uint8Array) => {
          await Promise.resolve();
          if (files.has(path)) {
            return false;
          }
          files.set(path, new TextDecoder().decode(data));
          return true;
        },
      },
    };
  };

  it.effect("round-trips a put/get on disk", () =>
    Effect.gen(function* () {
      const { io } = mkIo();
      const store = makeFileCacheStore("/root", io);
      const fp = "f1";
      yield* store.put(fp, entry({ bytes: new Uint8Array([9]) }));
      const got = yield* store.get(fp);
      if (Option.isNone(got)) {
        assert.fail("expected a cache hit");
        return;
      }
      assert.deepEqual(Array.from(got.value.bytes), [9]);
    })
  );

  it.effect("returns none on a disk miss", () =>
    Effect.gen(function* () {
      const { io } = mkIo();
      const store = makeFileCacheStore("/root", io);
      const got = yield* store.get("missing");
      assert.isTrue(Option.isNone(got));
    })
  );
});
