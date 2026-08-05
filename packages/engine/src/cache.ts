import type { CachePolicy, SourceSpec } from "@viokit/schema";
import { Context, Effect, Layer, Option } from "effect";
import { fnv1aHex } from "./hash.js";

/**
 * The freshness verdict for a cached entry at read time, given the source's
 * cache mode. Governs whether the pipeline serves from cache or must egress.
 */
export type CacheReadVerdict =
  | { readonly kind: "fresh"; readonly entry: CacheEntry }
  | { readonly kind: "stale-within-max-stale"; readonly entry: CacheEntry }
  | { readonly kind: "stale" };

const isFresh = (entry: CacheEntry, now: number, ttlMs: number): boolean =>
  ttlMs <= 0 || now <= entry.createdAt + ttlMs;

/**
 * Decide whether a cached entry is usable for the given policy (task 2.6).
 * `live-only` never reads the cache (returns `stale` so the pipeline egresses);
 * `refresh` ignores the cache (same); `cache-first` and `cache-only` consult the
 * entry and accept it when fresh or within the `maxStale` window.
 */
export const evaluateCacheRead = (
  policy: CachePolicy,
  entry: Option.Option<CacheEntry>,
  now: number
): CacheReadVerdict => {
  if (policy.mode === "live-only" || policy.mode === "refresh") {
    return { kind: "stale" };
  }
  if (Option.isNone(entry)) {
    return { kind: "stale" };
  }
  const { value } = entry;
  const ttlMs = policy.ttlMs ?? 0;
  if (isFresh(value, now, ttlMs)) {
    return { entry: value, kind: "fresh" };
  }
  const maxStaleUntil = value.createdAt + ttlMs + (policy.maxStaleMs ?? 0);
  if (now <= maxStaleUntil) {
    return { entry: value, kind: "stale-within-max-stale" };
  }
  return { kind: "stale" };
};

/**
 * A cached source response plus the metadata needed to enforce freshness
 * (`ttl`/`maxStale`) at read time. Times are epoch milliseconds.
 */
export interface CacheEntry {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly maxStaleUntil: number;
}

/** The `CacheStore` seam (TDR-006): `get`/`put` keyed by request fingerprint. */
export interface CacheStore {
  readonly get: (
    fingerprint: string
  ) => Effect.Effect<Option.Option<CacheEntry>>;
  readonly put: (fingerprint: string, entry: CacheEntry) => Effect.Effect<void>;
}

/**
 * Derive a stable, canonical request fingerprint with credentials stripped.
 * The fingerprint is a 64-bit FNV-1a hash of a JSON serialization that includes
 * the source identity and non-secret request fields but never `auth` (so two
 * requests that differ only in their credential collide — task 2.5 / I9).
 */
export const requestFingerprint = (source: SourceSpec): string => {
  const canonical = JSON.stringify({
    id: source.id,
    transport: source.transport,
    url: source.url,
  });
  return fnv1aHex(new TextEncoder().encode(canonical));
};

/**
 * In-memory L1 cache: a `Map` with a simple LRU bound. Reads and writes are
 * synchronous (no errors), so `get`/`put` have a `never` error channel.
 */
export const makeMemoryCacheStore = (maxEntries = 256): CacheStore => {
  const byFingerprint = new Map<string, CacheEntry>();

  const touch = (fingerprint: string): void => {
    const entry = byFingerprint.get(fingerprint);
    if (entry === undefined) {
      return;
    }
    byFingerprint.delete(fingerprint);
    byFingerprint.set(fingerprint, entry);
  };

  const evict = (): void => {
    while (byFingerprint.size > maxEntries) {
      const oldest = byFingerprint.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      byFingerprint.delete(oldest);
    }
  };

  return {
    get: (fingerprint) =>
      Effect.sync(() => {
        const entry = byFingerprint.get(fingerprint);
        if (entry === undefined) {
          return Option.none();
        }
        touch(fingerprint);
        return Option.some(entry);
      }),
    put: (fingerprint, entry) =>
      Effect.sync(() => {
        byFingerprint.set(fingerprint, entry);
        evict();
      }),
  };
};

/** Content-addressed filesystem cache key layout: `<root>/cache/<shard>/<fp>.json`. */
const cachePath = (root: string, fingerprint: string): string =>
  `${root}/cache/${fingerprint.slice(0, 2)}/${fingerprint}.json`;

const encodeEntry = (entry: CacheEntry): string =>
  JSON.stringify({
    bytes: Array.from(entry.bytes),
    contentType: entry.contentType,
    createdAt: entry.createdAt,
    expiresAt: entry.expiresAt,
    maxStaleUntil: entry.maxStaleUntil,
  });

const decodeEntry = (raw: string): CacheEntry => {
  const parsed = JSON.parse(raw) as {
    bytes: number[];
    contentType: string;
    createdAt: number;
    expiresAt: number;
    maxStaleUntil: number;
  };
  return {
    bytes: new Uint8Array(parsed.bytes),
    contentType: parsed.contentType,
    createdAt: parsed.createdAt,
    expiresAt: parsed.expiresAt,
    maxStaleUntil: parsed.maxStaleUntil,
  };
};

/** Filesystem-backed `CacheStore` (L2), keyed by fingerprint (task 2.3). */
export const makeFileCacheStore = (
  root: string,
  io: {
    readonly exists: (path: string) => Promise<boolean>;
    readonly makeDirectory: (path: string) => Promise<void>;
    readonly readFile: (path: string) => Promise<Uint8Array>;
    readonly writeFileExclusive: (
      path: string,
      data: Uint8Array
    ) => Promise<boolean>;
  }
): CacheStore => ({
  get: (fingerprint) =>
    Effect.gen(function* () {
      const path = cachePath(root, fingerprint);
      const present = yield* Effect.promise(() =>
        io.exists(path).catch(() => false)
      );
      if (!present) {
        return Option.none();
      }
      const raw = yield* Effect.promise(() =>
        io.readFile(path).catch(() => new Uint8Array(0))
      );
      if (raw.byteLength === 0) {
        return Option.none();
      }
      return Option.some(decodeEntry(new TextDecoder().decode(raw)));
    }),
  put: (fingerprint, entry) =>
    Effect.gen(function* () {
      const path = cachePath(root, fingerprint);
      yield* Effect.promise(() =>
        io
          .makeDirectory(path.slice(0, path.lastIndexOf("/")))
          .catch(() => undefined)
      );
      const data = new TextEncoder().encode(encodeEntry(entry));
      yield* Effect.promise(() =>
        io.writeFileExclusive(path, data).catch(() => false)
      );
    }),
});

/** Backend selector mirroring the evidence backend pattern (task 2.4). */
export type CacheBackend = "memory" | "filesystem";

export class CacheBackendConfig extends Context.Service<
  CacheBackendConfig,
  CacheBackend
>()("CacheBackendConfig", {
  make: Effect.sync((): CacheBackend => "memory"),
}) {}

/** Root directory the filesystem cache tier persists to (task 2.4). */
export class CacheRootDir extends Context.Service<CacheRootDir, string>()(
  "CacheRootDir"
) {}

/** Provides `CacheStore` (in-memory by default). */
export class CacheService extends Context.Service<CacheService, CacheStore>()(
  "CacheService",
  {
    make: Effect.sync(() => makeMemoryCacheStore()),
  }
) {}

export const CacheLayer = Layer.effect(CacheService, CacheService.make);

/**
 * Config-driven `CacheStore` backend (task 2.4): selects the in-memory tier by
 * default, or the filesystem tier when `CacheBackendConfig` is `"filesystem"`.
 * Mirrors the evidence backend selector in `evidence-fs.ts`.
 */
export const CacheBackendLayer: Layer.Layer<
  CacheService,
  never,
  CacheBackendConfig | CacheRootDir
> = Layer.effect(
  CacheService,
  Effect.gen(function* () {
    const backend = yield* CacheBackendConfig;
    if (backend === "filesystem") {
      const root = yield* CacheRootDir;
      const io = {
        exists: async (path: string) => {
          try {
            await import("node:fs/promises").then(({ stat }) => stat(path));
            return true;
          } catch {
            return false;
          }
        },
        makeDirectory: async (path: string) => {
          await import("node:fs/promises").then(({ mkdir }) =>
            mkdir(path, { recursive: true })
          );
        },
        readFile: async (path: string) => {
          const { readFile } = await import("node:fs/promises");
          return new Uint8Array(await readFile(path));
        },
        writeFileExclusive: async (path: string, data: Uint8Array) => {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(path, data, { flag: "wx" });
          return true;
        },
      };
      return makeFileCacheStore(root, io);
    }
    return makeMemoryCacheStore();
  })
);
