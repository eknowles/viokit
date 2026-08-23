import { createHash } from "node:crypto";
import { assert, describe, layer } from "@effect/vitest";
import { evidenceId, Live } from "@viokit/schema";
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

/**
 * TDR-021: the identifier attests to the content rather than merely indexing
 * it, so a recipient can check an artifact against its id with standard tools.
 */
describe("evidence identity is a cryptographic digest (I1)", () => {
  layer(MemoryEvidenceLayer)((it) => {
    const bytes = (value: string) => new TextEncoder().encode(value);
    const digest = (value: string) =>
      createHash("sha256").update(bytes(value)).digest("hex");

    it.effect("the identifier equals the SHA-256 of the bytes", () =>
      Effect.gen(function* () {
        const store = yield* EvidenceService;
        const stored = yield* store.put({
          acquiredAt: new Date("2024-06-01T00:00:00.000Z"),
          acquisitionPath: Live.make({}),
          bytes: bytes("the artifact"),
          contentType: "text/plain",
          observedAt: new Date("2024-06-01T00:00:00.000Z"),
        });
        assert.strictEqual(stored.id, digest("the artifact"));
        // 64 hex characters — a full digest, checkable with `shasum -a 256`.
        assert.strictEqual(stored.id.length, 64);
      })
    );

    it.effect("different bytes cannot share an identifier", () =>
      Effect.gen(function* () {
        const store = yield* EvidenceService;
        const one = yield* store.put({
          acquiredAt: new Date("2024-06-01T00:00:00.000Z"),
          acquisitionPath: Live.make({}),
          bytes: bytes("one"),
          contentType: "text/plain",
          observedAt: new Date("2024-06-01T00:00:00.000Z"),
        });
        const two = yield* store.put({
          acquiredAt: new Date("2024-06-01T00:00:00.000Z"),
          acquisitionPath: Live.make({}),
          bytes: bytes("two"),
          contentType: "text/plain",
          observedAt: new Date("2024-06-01T00:00:00.000Z"),
        });
        assert.notStrictEqual(one.id, two.id);
      })
    );

    it.effect("identical bytes still resolve to one artifact", () =>
      Effect.gen(function* () {
        const store = yield* EvidenceService;
        const input = {
          acquiredAt: new Date("2024-06-01T00:00:00.000Z"),
          acquisitionPath: Live.make({}),
          bytes: bytes("same"),
          contentType: "text/plain",
          observedAt: new Date("2024-06-01T00:00:00.000Z"),
        };
        const first = yield* store.put(input);
        const second = yield* store.put(input);
        assert.strictEqual(first.id, second.id);
      })
    );
  });
});
