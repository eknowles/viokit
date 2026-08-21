import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { PromoterService, PromotionError } from "./seams.js";

const header = `import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add transport/auth/cache/egress
// policy and a projection to make this a runnable source (see PACK_RECIPE).
`;

const isMissingFile = (error: NodeJS.ErrnoException): boolean =>
  error.code === "ENOENT";

/** Reads a pack file, treating a missing file as empty (first promotion). */
const readExisting = (path: string): Promise<string> =>
  readFile(path, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (isMissingFile(error)) {
      return "";
    }
    throw error;
  });

const leadingDigit = /^[0-9]/;

/** Sanitizes a domain/id into a valid JS export identifier. */
const toExportName = (sourceId: string): string => {
  const sanitized = sourceId.replace(/[^A-Za-z0-9_$]/g, "_");
  return leadingDigit.test(sanitized) ? `_${sanitized}` : sanitized;
};

/**
 * Appends an exported `SourceSpec` constant to `<packsDir>/<category>/sources.ts`.
 * Creates the pack dir/file if absent. `source` is a serializable object
 * matching the `SourceSpec` schema shape.
 */
const renderSourceExport = (sourceId: string, source: unknown): string =>
  `\nexport const ${toExportName(sourceId)}: SourceSpec = ${JSON.stringify(
    source,
    null,
    2
  )};\n`;

const appendSource =
  (packsDir: string) => (category: string, sourceId: string, source: unknown) =>
    Effect.gen(function* () {
      const dir = join(packsDir, category);
      const path = join(dir, "sources.ts");
      yield* Effect.tryPromise({
        catch: (cause) => new PromotionError({ cause, id: sourceId }),
        try: () => mkdir(dir, { recursive: true }),
      });
      const existing = yield* Effect.tryPromise({
        catch: (cause) => new PromotionError({ cause, id: sourceId }),
        try: () => readExisting(path),
      });
      const next =
        existing.trim().length === 0
          ? header + renderSourceExport(sourceId, source)
          : existing + renderSourceExport(sourceId, source);
      yield* Effect.tryPromise({
        catch: (cause) => new PromotionError({ cause, id: sourceId }),
        try: () => writeFile(path, next, "utf8"),
      });
    });

/**
 * Writes promoted sources under `packsDir`, which the caller takes from
 * `ViokitConfig` — the path is resolved from the workspace root, not from the
 * directory the CLI happened to be invoked in.
 */
export const makePromoterLayer = (packsDir: string) =>
  Layer.effect(
    PromoterService,
    Effect.sync(() => ({ writeSource: appendSource(packsDir) }))
  );
