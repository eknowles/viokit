import { assert, describe, layer } from "@effect/vitest";
import { evidenceId } from "@viokit/schema";
import { Effect, Layer, Option } from "effect";
import { EvidenceService } from "../src/evidence.js";
import { EvidenceBackendMemory, EvidenceLayer } from "../src/evidence-fs.js";
import { pastInput } from "./support.js";

const MemoryEvidenceLayer = Layer.provide(EvidenceLayer, EvidenceBackendMemory);

describe("stores and retrieves by id", () => {
  layer(MemoryEvidenceLayer)((it) => {
    it.effect("", () =>
      Effect.gen(function* () {
        const store = yield* EvidenceService;
        const evidence = yield* store.put(pastInput);
        const fetched = yield* store.get(evidence.id);
        const value = Option.getOrThrow(fetched);
        assert.deepEqual(Array.from(value.bytes), [1, 2, 3]);
      })
    );
  });
});

describe("content hash is identity: identical bytes dedupe (I1)", () => {
  layer(MemoryEvidenceLayer)((it) => {
    it.effect("", () =>
      Effect.gen(function* () {
        const store = yield* EvidenceService;
        const first = yield* store.put(pastInput);
        const second = yield* store.put({
          ...pastInput,
          contentType: "text/plain",
        });
        assert.strictEqual(first.id, second.id);
      })
    );
  });
});

describe("different bytes produce different ids", () => {
  layer(MemoryEvidenceLayer)((it) => {
    it.effect("", () =>
      Effect.gen(function* () {
        const store = yield* EvidenceService;
        const first = yield* store.put(pastInput);
        const second = yield* store.put({
          ...pastInput,
          bytes: new Uint8Array([9, 9]),
        });
        assert.notStrictEqual(first.id, second.id);
      })
    );
  });
});

describe("lists stored evidence", () => {
  layer(MemoryEvidenceLayer)((it) => {
    it.effect("", () =>
      Effect.gen(function* () {
        const store = yield* EvidenceService;
        yield* store.put(pastInput);
        yield* store.put({ ...pastInput, bytes: new Uint8Array([5]) });
        const all = yield* store.list;
        assert.strictEqual(all.length, 2);
      })
    );
  });
});

describe("missing id yields none", () => {
  layer(MemoryEvidenceLayer)((it) => {
    it.effect("", () =>
      Effect.gen(function* () {
        const store = yield* EvidenceService;
        const found = yield* store.get(evidenceId("nope"));
        assert.isTrue(Option.isNone(found));
      })
    );
  });
});
