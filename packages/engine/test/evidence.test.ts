import { assert, describe, layer } from "@effect/vitest";
import { evidenceId } from "@viokit/schema";
import { Effect, Option } from "effect";
import { EvidenceLayer, EvidenceService } from "../src/evidence.js";
import { pastInput } from "./support.js";

describe("stores and retrieves by id", () => {
  layer(EvidenceLayer)((it) => {
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
  layer(EvidenceLayer)((it) => {
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
  layer(EvidenceLayer)((it) => {
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
  layer(EvidenceLayer)((it) => {
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
  layer(EvidenceLayer)((it) => {
    it.effect("", () =>
      Effect.gen(function* () {
        const store = yield* EvidenceService;
        const found = yield* store.get(evidenceId("nope"));
        assert.isTrue(Option.isNone(found));
      })
    );
  });
});
