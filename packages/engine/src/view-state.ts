import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ViewStateKey, ViewStateStore } from "@viokit/schema";
import {
  ViewStateDocument,
  ViewStateStoreService,
  ViewStateWriteError,
} from "@viokit/schema";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { fnv1aHex } from "./hash.js";

/**
 * Filesystem-backed view state (TDR-012): one document per key under a
 * configured root, kept entirely apart from the step log and the evidence
 * store. A graph export, backup, or replay carries none of it — which is the
 * separation I12 requires, achieved structurally rather than by convention.
 */

/** Where documents live. Empty means "nowhere" — saves fail, loads are absent. */
export class ViewStateRoot extends Context.Service<ViewStateRoot, string>()(
  "ViewStateRoot"
) {}

export const defaultViewStateRoot = "";

/**
 * Path is derived by hashing the key rather than interpolating it, so a surface
 * name or investigation id cannot escape the root or collide through path
 * characters.
 */
const fileFor = (root: string, key: ViewStateKey): string => {
  const canonical = `${key.user} ${key.investigation} ${key.surface}`;
  return join(root, `${fnv1aHex(new TextEncoder().encode(canonical))}.json`);
};

export const makeViewStateStore = (root: string): ViewStateStore => ({
  load: (key, version) =>
    Effect.gen(function* () {
      if (root.trim() === "") {
        return Option.none();
      }
      const contents = yield* Effect.orElseSucceed(
        Effect.tryPromise(() => readFile(fileFor(root, key), "utf8")),
        () => null
      );
      if (contents === null) {
        return Option.none();
      }
      // A document that cannot be decoded, or was written under a version this
      // caller does not recognise, is absence: the surface starts from defaults
      // rather than failing.
      const decoded = yield* Effect.orElseSucceed(
        Effect.try(() =>
          Schema.decodeUnknownSync(ViewStateDocument)(JSON.parse(contents))
        ),
        () => null
      );
      if (decoded === null || decoded.version !== version) {
        return Option.none();
      }
      return Option.some(decoded);
    }),

  save: (document) =>
    Effect.gen(function* () {
      if (root.trim() === "") {
        return yield* ViewStateWriteError.make({
          message: "no view-state root configured",
        });
      }
      yield* Effect.tryPromise({
        catch: (cause) =>
          ViewStateWriteError.make({
            message: cause instanceof Error ? cause.message : String(cause),
          }),
        try: async () => {
          await mkdir(root, { recursive: true });
          const encoded = Schema.encodeUnknownSync(ViewStateDocument)(document);
          await writeFile(
            fileFor(root, document.key),
            JSON.stringify(encoded),
            "utf8"
          );
        },
      });
    }),
});

export const ViewStateLayer: Layer.Layer<ViewStateStoreService, never, never> =
  Layer.effect(
    ViewStateStoreService,
    Effect.gen(function* () {
      const root = Option.getOrElse(
        yield* Effect.serviceOption(ViewStateRoot),
        () => process.env.VIOKIT_VIEW_STATE_DIR ?? defaultViewStateRoot
      );
      return makeViewStateStore(root);
    })
  );

export const makeViewStateLayer = (
  root: string
): Layer.Layer<ViewStateStoreService> =>
  Layer.succeed(ViewStateStoreService, makeViewStateStore(root));
