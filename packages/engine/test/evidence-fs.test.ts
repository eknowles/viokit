import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, it, layer } from "@effect/vitest";
import { evidenceId } from "@viokit/schema";
import { Effect, Layer, Option } from "effect";
import { afterAll, beforeAll } from "vitest";
import { EvidenceService } from "../src/evidence.js";
import {
  EvidenceBackendFilesystem,
  EvidenceFilesystemLayer,
  EvidenceFilesystemService,
  EvidenceFsLayer,
  EvidenceLayer,
  EvidenceRootDir,
  makeEvidenceFsStore,
} from "../src/evidence-fs.js";
import { pastInput } from "./support.js";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "viokit-evid-"));
});

afterAll(async () => {
  await rm(root, { force: true, recursive: true });
});

const FsLayer = EvidenceFsLayer.pipe(
  Layer.provide(
    Layer.effect(
      EvidenceRootDir,
      Effect.sync(() => root)
    )
  )
);

describe("filesystem evidence store", () => {
  layer(FsLayer)((t) => {
    t.effect("persists and reads back a put", () =>
      Effect.gen(function* () {
        const store = yield* EvidenceService;
        const evidence = yield* store.put(pastInput);
        const fetched = Option.getOrThrow(yield* store.get(evidence.id));
        assert.deepEqual(Array.from(fetched.bytes), [1, 2, 3]);
      })
    );

    t.effect(
      "content-addressed write-once: dedupe returns first metadata (I1)",
      () =>
        Effect.gen(function* () {
          const store = yield* EvidenceService;
          const first = yield* store.put(pastInput);
          const second = yield* store.put({
            ...pastInput,
            contentType: "text/plain",
          });
          assert.strictEqual(first.id, second.id);
          assert.strictEqual(second.contentType, "application/octet-stream");
        })
    );

    t.effect("list scans files consistent with stored set", () =>
      Effect.gen(function* () {
        const store = yield* EvidenceService;
        yield* store.put(pastInput);
        yield* store.put({ ...pastInput, bytes: new Uint8Array([5]) });
        const all = yield* store.list;
        assert.strictEqual(all.length, 2);
      })
    );

    t.effect("missing id yields none", () =>
      Effect.gen(function* () {
        const store = yield* EvidenceService;
        const found = yield* store.get(evidenceId("nope"));
        assert.isTrue(Option.isNone(found));
      })
    );

    t.effect(
      "read-after-reopen: a fresh store over the same dir sees persisted evidence",
      () =>
        Effect.gen(function* () {
          const store = yield* EvidenceService;
          const evidence = yield* store.put(pastInput);
          const fs = yield* Effect.provide(EvidenceFilesystemLayer)(
            EvidenceFilesystemService
          );
          const reopened = makeEvidenceFsStore(root, fs);
          const fetched = Option.getOrThrow(yield* reopened.get(evidence.id));
          assert.deepEqual(Array.from(fetched.bytes), [1, 2, 3]);
        })
    );
  });
});

describe("evidence backend boundary validation (1.1)", () => {
  it.effect("filesystem backend with an empty root is rejected", () =>
    Effect.gen(function* () {
      const outcome = yield* Effect.provide(
        EvidenceLayer.pipe(
          Layer.provide(EvidenceBackendFilesystem),
          Layer.provide(Layer.succeed(EvidenceRootDir, ""))
        )
      )(EvidenceService).pipe(
        Effect.catchTag("EvidenceWriteError", () => Effect.succeed("rejected"))
      );
      assert.strictEqual(outcome, "rejected");
    })
  );
});
