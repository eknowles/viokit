import { assert, describe, it } from "@effect/vitest";
import { Effect, Result, Schema } from "effect";
import {
  decodeEvidenceBoundary,
  decodeTemporalExtentBoundary,
} from "../src/boundary.js";
import {
  Cache,
  Entity,
  Event,
  EvidenceInput,
  entityId,
  eventId,
  GraphState,
  Identifier,
  Live,
  Relation,
  relationId,
  SourceSpec,
  SpatialExtent,
  TemporalExtent,
} from "../src/index.js";

const roundTrip = <
  S extends Schema.ConstraintDecoder<unknown> &
    Schema.ConstraintEncoder<unknown>,
>(
  schema: S,
  value: S["Type"]
): S["Type"] =>
  Schema.decodeUnknownSync(schema)(Schema.encodeUnknownSync(schema)(value));

describe("primitive suite round-trips (3.1)", () => {
  const entity = Entity.make({
    id: entityId("e1"),
    identifiers: [Identifier.make({ kind: "email", value: "a@b" })],
    kind: "person",
    spatialExtent: SpatialExtent.make({ lat: 1, lon: 2 }),
    temporalExtent: TemporalExtent.make({
      validFrom: new Date("2024-01-01T00:00:00.000Z"),
      validTo: new Date("2024-01-02T00:00:00.000Z"),
    }),
  });

  it("round-trips an Identifier", () => {
    const decoded = roundTrip(
      Identifier,
      Identifier.make({ kind: "email", value: "a@b" })
    );
    assert.strictEqual(decoded.kind, "email");
    assert.strictEqual(decoded.value, "a@b");
  });

  it("round-trips a spatial extent", () => {
    const decoded = roundTrip(
      SpatialExtent,
      SpatialExtent.make({ lat: 1, lon: 2 })
    );
    assert.strictEqual(decoded.lat, 1);
    assert.strictEqual(decoded.lon, 2);
  });

  it("round-trips a temporal extent", () => {
    const decoded = roundTrip(TemporalExtent, entity.temporalExtent);
    assert.strictEqual(
      decoded.validFrom.getTime(),
      new Date("2024-01-01T00:00:00.000Z").getTime()
    );
  });

  it("round-trips an Entity", () => {
    const decoded = roundTrip(Entity, entity);
    assert.strictEqual(decoded.id, entity.id);
    assert.strictEqual(decoded.identifiers.length, 1);
    assert.strictEqual(decoded.kind, "person");
  });

  it("round-trips a Relation", () => {
    const relation = Relation.make({
      id: relationId("r1"),
      sourceId: entityId("e1"),
      targetId: entityId("e2"),
      temporalExtent: entity.temporalExtent,
      type: "knows",
    });
    const decoded = roundTrip(Relation, relation);
    assert.strictEqual(decoded.type, "knows");
    assert.strictEqual(decoded.sourceId, relation.sourceId);
  });

  it("round-trips an Event", () => {
    const event = Event.make({
      entityIds: [entityId("e1")],
      id: eventId("ev1"),
      kind: "birth",
      spatialExtent: SpatialExtent.make({ lat: 1, lon: 2 }),
      temporalExtent: entity.temporalExtent,
    });
    const decoded = roundTrip(Event, event);
    assert.strictEqual(decoded.kind, "birth");
    assert.deepEqual(decoded.entityIds, event.entityIds);
  });
});

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
