import { assert, describe, it } from "@effect/vitest";
import { Effect, Result, Schema } from "effect";
import {
  decodeEvidenceBoundary,
  decodeTemporalExtentBoundary,
} from "../src/boundary.js";
import {
  Cache,
  Entity,
  EvidenceInput,
  entityId,
  GraphState,
  Live,
  SourceSpec,
  TemporalExtent,
} from "../src/index.js";

describe("temporal extent boundary", () => {
  it.effect("accepts validFrom <= validTo", () =>
    Effect.gen(function* () {
      const extent = yield* decodeTemporalExtentBoundary({
        validFrom: new Date("2024-01-01T00:00:00.000Z"),
        validTo: new Date("2024-01-02T00:00:00.000Z"),
      });
      assert.strictEqual(
        extent.validFrom.getTime(),
        new Date("2024-01-01T00:00:00.000Z").getTime()
      );
    })
  );

  it.effect("rejects validFrom > validTo (I5)", () =>
    Effect.gen(function* () {
      const failure = yield* decodeTemporalExtentBoundary({
        validFrom: new Date("2024-01-02T00:00:00.000Z"),
        validTo: new Date("2024-01-01T00:00:00.000Z"),
      }).pipe(Effect.result);
      assert.isTrue(Result.isFailure(failure));
    })
  );
});

describe("evidence boundary", () => {
  const pastInput = {
    acquiredAt: new Date("2024-01-01T00:00:00.000Z"),
    acquisitionPath: Live.make({}),
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "application/octet-stream",
    observedAt: new Date("2024-01-01T00:00:00.000Z"),
  };

  it.live("accepts valid evidence", () =>
    Effect.gen(function* () {
      const input = yield* decodeEvidenceBoundary(pastInput);
      assert.deepEqual(Array.from(input.bytes), [1, 2, 3]);
    })
  );

  it.effect("rejects future-dated evidence (I5)", () =>
    Effect.gen(function* () {
      const future = new Date("9999-12-31T00:00:00.000Z");
      const failure = yield* decodeEvidenceBoundary({
        ...pastInput,
        observedAt: future,
      }).pipe(Effect.result);
      assert.isTrue(Result.isFailure(failure));
    })
  );
});

describe("evidence input schema", () => {
  it("round-trips acquisition path variants", () => {
    for (const acquisitionPath of [
      Live.make({}),
      Cache.make({ ref: "bucket/obj" }),
    ]) {
      const input = EvidenceInput.make({
        acquiredAt: new Date("2024-01-01T00:00:00.000Z"),
        acquisitionPath,
        bytes: new Uint8Array([9]),
        contentType: "text/plain",
        observedAt: new Date("2024-01-01T00:00:00.000Z"),
      });
      const decoded = Schema.decodeUnknownSync(EvidenceInput)(input);
      assert.strictEqual(decoded.acquisitionPath._tag, acquisitionPath._tag);
    }
  });
});

describe("graph state", () => {
  it("decodes a graph state and source spec", () => {
    const entity = Entity.make({
      id: entityId("e1"),
      identifiers: [],
      kind: "person",
      spatialExtent: { lat: 1, lon: 2 },
      temporalExtent: TemporalExtent.make({
        validFrom: new Date("2024-01-01T00:00:00.000Z"),
        validTo: new Date("2024-01-01T00:00:00.000Z"),
      }),
    });
    const state = GraphState.make({
      entities: [entity],
      events: [],
      relations: [],
    });
    const decoded = Schema.decodeUnknownSync(GraphState)(state);
    assert.strictEqual(decoded.entities.length, 1);
    const sourceSpec = Schema.decodeUnknownSync(SourceSpec)({
      id: "s1",
      transport: "http",
      url: "https://x",
    });
    assert.strictEqual(sourceSpec.transport, "http");
  });
});
