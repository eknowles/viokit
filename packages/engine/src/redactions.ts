import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { InvestigationId, RedactionStore } from "@viokit/schema";
import {
  Redaction,
  RedactionStoreService,
  RedactionWriteError,
  reviveDates,
} from "@viokit/schema";
import { Context, Effect, Layer, Schema } from "effect";
import { fnv1aHex } from "./hash.js";

/**
 * In-memory redaction store (TDR-024).
 *
 * Append-only, like everything else that records a fact here: redacting twice is
 * not an error, and nothing is ever removed. Behind a seam so a durable backend
 * can replace it without touching a consumer — the same shape the evidence store
 * took before it grew one.
 */
export const makeMemoryRedactionStore = (): RedactionStore => {
  const byInvestigation = new Map<string, Redaction[]>();
  return {
    forInvestigation: (investigation) =>
      Effect.sync(() => [...(byInvestigation.get(investigation) ?? [])]),
    redact: (redaction) =>
      Effect.sync(() => {
        const existing = byInvestigation.get(redaction.investigation) ?? [];
        byInvestigation.set(redaction.investigation, [...existing, redaction]);
        return redaction;
      }),
  };
};

/**
 * Filesystem-backed redactions: one append-only file per investigation, under a
 * configured root and apart from both the evidence store and the step log
 * (TDR-024), the same separation TDR-012 chose for view state.
 *
 * Durability is not optional here, and finding that out the hard way is why this
 * exists: with an in-memory store, a redaction recorded by one CLI invocation
 * was gone by the next, so the export happily carried material somebody had
 * withheld. A governance mechanism that forgets is worse than none, because it
 * is believed.
 */
export class RedactionRoot extends Context.Service<RedactionRoot, string>()(
  "RedactionRoot"
) {}

export const defaultRedactionRoot = "./.viokit/redactions";

const decodeRedactions = Schema.decodeUnknownSync(Schema.Array(Redaction));

/** Hashed, so an investigation id cannot escape the root or collide. */
const encodeText = new TextEncoder();

const fileFor = (root: string, investigation: string): string =>
  join(root, `${fnv1aHex(encodeText.encode(investigation))}.json`);

export const makeFsRedactionStore = (root: string): RedactionStore => {
  const read = (investigation: string) =>
    Effect.tryPromise({
      catch: (cause) =>
        RedactionWriteError.make({
          message: `could not read redactions: ${String(cause)}`,
        }),
      try: async () => {
        try {
          const raw = await readFile(fileFor(root, investigation), "utf8");
          return decodeRedactions(JSON.parse(raw, reviveDates));
        } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
            return [] as readonly Redaction[];
          }
          throw cause;
        }
      },
    });

  return {
    forInvestigation: read,
    redact: (redaction) =>
      Effect.gen(function* () {
        const existing = yield* read(redaction.investigation);
        yield* Effect.tryPromise({
          catch: (cause) =>
            RedactionWriteError.make({
              message: `could not record redaction: ${String(cause)}`,
            }),
          try: async () => {
            await mkdir(root, { recursive: true });
            await writeFile(
              fileFor(root, redaction.investigation),
              JSON.stringify(
                Schema.encodeUnknownSync(Schema.Array(Redaction))([
                  ...existing,
                  redaction,
                ])
              ),
              "utf8"
            );
          },
        });
        return redaction;
      }),
  };
};

export const makeRedactionLayer = (
  root: string
): Layer.Layer<RedactionStoreService> =>
  Layer.sync(RedactionStoreService, () =>
    root.trim() === "" ? makeMemoryRedactionStore() : makeFsRedactionStore(root)
  );

/** The default: durable under `.viokit/redactions`. */
export const RedactionStoreLayer: Layer.Layer<RedactionStoreService> =
  makeRedactionLayer(process.env.VIOKIT_REDACTION_DIR ?? defaultRedactionRoot);

/** The artifacts withheld from a case, as a set for the export and read paths. */
export const withheldIn = (
  store: RedactionStore,
  investigation: InvestigationId
) =>
  Effect.map(
    store.forInvestigation(investigation),
    (redactions) =>
      new Map(redactions.map((one) => [one.evidenceId as string, one]))
  );
