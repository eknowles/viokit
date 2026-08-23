import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SourceSpec } from "@viokit/schema";
import { Effect, Layer, Schema } from "effect";
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
 * Appends an exported `SourceSpec` constant to `packs/<category>/sources.ts`.
 * Creates the pack dir/file if absent. `source` is a serializable object
 * matching the `SourceSpec` schema shape.
 */
const renderSourceExport = (sourceId: string, source: unknown): string =>
  `\nexport const ${toExportName(sourceId)}: SourceSpec = ${JSON.stringify(
    source,
    null,
    2
  )};\n`;

/**
 * Promotion writes a *valid* `SourceSpec` (R4), so the spec is decoded before
 * anything reaches the pack file. Without this the promoter will happily write
 * a candidate-shaped object annotated as `SourceSpec` — the pack files are not
 * type-checked by any tsconfig, so nothing downstream would catch it until a
 * consumer tried to run the source.
 */
const decodeSpec = (sourceId: string, source: unknown) =>
  Effect.try({
    catch: (cause) => new PromotionError({ cause, id: sourceId }),
    try: () => Schema.decodeUnknownSync(SourceSpec)(source),
  });

const appendSource = (category: string, sourceId: string, source: unknown) =>
  Effect.gen(function* () {
    yield* decodeSpec(sourceId, source);
    const dir = join(process.cwd(), "packs", category);
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

export const PromoterLayer = Layer.effect(
  PromoterService,
  Effect.sync(() => ({ writeSource: appendSource }))
);
