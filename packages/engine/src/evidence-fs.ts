import {
  mkdir,
  readdir,
  readFile as readFileNode,
  stat,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import type { EvidenceId, EvidenceInput, EvidenceStore } from "@viokit/schema";
import {
  AcquisitionPath,
  Evidence,
  EvidenceReadError,
  EvidenceWriteError,
  evidenceId,
} from "@viokit/schema";
import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { EvidenceService } from "./evidence.js";
import { fnv1aHex } from "./hash.js";

const encodeText = new TextEncoder();
const decodeText = new TextDecoder();

const toWriteError = (cause: unknown): EvidenceWriteError =>
  EvidenceWriteError.make({
    message: cause instanceof Error ? cause.message : String(cause),
  });

const toReadError = (cause: unknown): EvidenceReadError =>
  EvidenceReadError.make({
    message: cause instanceof Error ? cause.message : String(cause),
  });

/**
 * Injectable filesystem backend for evidence. Lives in the engine so a future
 * S3/MinIO backend can swap in behind the same `EvidenceStore` seam (TDR-007).
 */
export interface EvidenceFilesystem {
  readonly exists: (path: string) => Effect.Effect<boolean, never>;
  readonly listFiles: (
    dir: string
  ) => Effect.Effect<readonly string[], EvidenceReadError>;
  readonly makeDirectory: (
    path: string
  ) => Effect.Effect<void, EvidenceWriteError>;
  readonly readFile: (
    path: string
  ) => Effect.Effect<Uint8Array, EvidenceReadError>;
  readonly writeFileExclusive: (
    path: string,
    data: Uint8Array
  ) => Effect.Effect<boolean, EvidenceWriteError>;
}

export class EvidenceFilesystemService extends Context.Service<
  EvidenceFilesystemService,
  EvidenceFilesystem
>()("EvidenceFilesystemService", {
  make: Effect.sync(() => ({
    exists: (path) =>
      Effect.tryPromise(() => stat(path)).pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false)
      ),
    listFiles: (dir) =>
      Effect.tryPromise(() =>
        readdir(dir, { recursive: true, withFileTypes: true })
      ).pipe(
        Effect.map((entries) =>
          entries
            .filter((entry) => entry.isFile())
            .map((entry) => join(entry.parentPath, entry.name))
        ),
        Effect.catchIf(
          (error) =>
            (error.cause as { code?: string } | undefined)?.code === "ENOENT",
          () => Effect.succeed([])
        ),
        Effect.mapError(toReadError)
      ),
    makeDirectory: (path) =>
      Effect.tryPromise(() => mkdir(path, { recursive: true })).pipe(
        Effect.mapError(toWriteError)
      ),
    readFile: (path) =>
      Effect.tryPromise(() => readFileNode(path)).pipe(
        Effect.map((bytes) => new Uint8Array(bytes)),
        Effect.mapError(toReadError)
      ),
    writeFileExclusive: (path, data) =>
      Effect.tryPromise(() => writeFile(path, data, { flag: "wx" })).pipe(
        Effect.as(true),
        Effect.catchIf(
          (error) =>
            (error.cause as { code?: string } | undefined)?.code === "EEXIST",
          () => Effect.succeed(false)
        ),
        Effect.mapError(toWriteError)
      ),
  })),
}) {}

export const EvidenceFilesystemLayer = Layer.effect(
  EvidenceFilesystemService,
  EvidenceFilesystemService.make
);

/** Marks the root directory an evidence store persists to. */
export class EvidenceRootDir extends Context.Service<EvidenceRootDir, string>()(
  "EvidenceRootDir"
) {}

const evidenceDir = (root: string, id: string): string => {
  const shard = id.slice(0, 2);
  return `${root}/evidence/${shard}`;
};

const evidencePath = (root: string, id: string): string =>
  `${evidenceDir(root, id)}/${id}.json`;

const encodeEvidence = (id: EvidenceId, input: EvidenceInput): Uint8Array => {
  const payload = {
    ...input,
    bytes: Array.from(input.bytes),
    id,
  };
  return encodeText.encode(JSON.stringify(payload));
};

const readEvidenceFile = (
  fs: EvidenceFilesystem,
  path: string
): Effect.Effect<Evidence, EvidenceReadError> =>
  Effect.gen(function* () {
    const raw = yield* fs.readFile(path);
    return yield* Effect.try({
      catch: toReadError,
      try: () => {
        const parsed = JSON.parse(decodeText.decode(raw)) as {
          id: string;
          contentType: string;
          bytes: number[];
          acquiredAt: string;
          observedAt: string;
          acquisitionPath: unknown;
        };
        return Evidence.make({
          acquiredAt: DateTime.toDateUtc(
            DateTime.makeUnsafe(parsed.acquiredAt)
          ),
          acquisitionPath: Schema.decodeUnknownSync(AcquisitionPath)(
            parsed.acquisitionPath
          ),
          bytes: new Uint8Array(parsed.bytes),
          contentType: parsed.contentType,
          id: evidenceId(parsed.id),
          observedAt: DateTime.toDateUtc(
            DateTime.makeUnsafe(parsed.observedAt)
          ),
        });
      },
    });
  });

/**
 * Filesystem-backed `EvidenceStore`. Content-addressed by hash (I1): the on-disk
 * filename is the content hash, writes are exclusive (write-once), and the list
 * is derived by scanning files, so it is always consistent with what is stored.
 */
export const makeEvidenceFsStore = (
  root: string,
  fs: EvidenceFilesystem
): EvidenceStore => ({
  get: (id) =>
    Effect.gen(function* () {
      const path = evidencePath(root, id);
      const present = yield* fs.exists(path);
      if (!present) {
        return Option.none();
      }
      const evidence = yield* readEvidenceFile(fs, path);
      return Option.some(evidence);
    }),
  list: Effect.gen(function* () {
    const files = yield* fs.listFiles(`${root}/evidence`);
    const all: Evidence[] = [];
    for (const file of files) {
      const evidence = yield* readEvidenceFile(fs, file);
      all.push(evidence);
    }
    return all;
  }),
  put: (input) =>
    Effect.gen(function* () {
      const id = evidenceId(fnv1aHex(input.bytes));
      const path = evidencePath(root, id);
      yield* fs.makeDirectory(evidenceDir(root, id));
      const created = yield* fs.writeFileExclusive(
        path,
        encodeEvidence(id, input)
      );
      if (!created) {
        return yield* readEvidenceFile(fs, path).pipe(
          Effect.mapError(toWriteError)
        );
      }
      return Evidence.make({ id, ...input });
    }),
});

/** Provides `EvidenceService` backed by the filesystem, given an `EvidenceRootDir`. */
export const EvidenceFsLayer: Layer.Layer<
  EvidenceService,
  EvidenceWriteError,
  EvidenceRootDir
> = Layer.effect(
  EvidenceService,
  Effect.gen(function* () {
    const root = yield* EvidenceRootDir;
    if (root.trim() === "") {
      return yield* EvidenceWriteError.make({
        message: "evidence root path must not be empty",
      });
    }
    const fs = yield* EvidenceFilesystemService;
    return makeEvidenceFsStore(root, fs);
  })
).pipe(Layer.provide(EvidenceFilesystemLayer));

/** Which evidence backend the config-driven `EvidenceLayer` selects. */
export type EvidenceBackend = "memory" | "filesystem";

/** Config selecting the evidence backend. Defaults to in-memory. */
export class EvidenceBackendConfig extends Context.Service<
  EvidenceBackendConfig,
  EvidenceBackend
>()("EvidenceBackendConfig", {
  make: Effect.sync((): EvidenceBackend => "memory"),
}) {}

export const EvidenceBackendMemory = Layer.succeed(
  EvidenceBackendConfig,
  "memory" as const
);

export const EvidenceBackendFilesystem = Layer.succeed(
  EvidenceBackendConfig,
  "filesystem" as const
);

/**
 * Config-driven `EvidenceStore` backend (D2): selects the in-memory backend by
 * default, or the filesystem backend when `EvidenceBackendConfig` is set to
 * `"filesystem"`. Same `EvidenceService` seam — a backend swap, no interface
 * change. The filesystem branch reads `EvidenceRootDir` optionally, so the
 * memory default needs no root path.
 */
export const EvidenceLayer: Layer.Layer<
  EvidenceService,
  EvidenceWriteError,
  EvidenceBackendConfig
> = Layer.effect(
  EvidenceService,
  Effect.gen(function* () {
    const backend = yield* EvidenceBackendConfig;
    if (backend === "filesystem") {
      const root = Option.getOrElse(
        yield* Effect.serviceOption(EvidenceRootDir),
        () => ""
      );
      if (root.trim() === "") {
        return yield* EvidenceWriteError.make({
          message:
            "evidence root path must not be empty for the filesystem backend",
        });
      }
      const fs = yield* EvidenceFilesystemService;
      return makeEvidenceFsStore(root, fs);
    }
    return yield* EvidenceService.make;
  })
).pipe(Layer.provide(EvidenceFilesystemLayer));
