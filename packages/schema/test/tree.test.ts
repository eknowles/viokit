import { assert, describe, it } from "@effect/vitest";
import { Schema } from "effect";
import {
  ExpandRequest,
  RunRecord,
  TREE_DEFAULTS,
  TransformAccepts,
  TransformSpec,
} from "../src/index.js";

const record = {
  addedEntities: [{ id: "a", kind: "domain" }],
  addedRelationCount: 1,
  depth: 0,
  durationMs: 12,
  inputEntityId: "example.com",
  inputKind: "domain",
  outcome: "ok",
  runId: "r1",
  startedAt: "2026-11-14T00:00:00.000Z",
  transformId: "dig-resolve",
};

describe("investigation tree schemas", () => {
  it("decodes a valid run record", () => {
    const decoded = Schema.decodeUnknownSync(RunRecord)(record);
    assert.strictEqual(decoded.outcome, "ok");
  });

  it("rejects a run record without an outcome", () => {
    const { outcome: _omitted, ...incomplete } = record;
    assert.throws(() => Schema.decodeUnknownSync(RunRecord)(incomplete));
  });

  it("rejects an unknown outcome", () => {
    assert.throws(() =>
      Schema.decodeUnknownSync(RunRecord)({ ...record, outcome: "maybe" })
    );
  });

  it("decodes an expand request with only a seed", () => {
    const request = Schema.decodeUnknownSync(ExpandRequest)({
      seedKind: "domain",
      seedValue: "example.com",
    });
    assert.strictEqual(request.maxDepth, undefined);
  });

  it("lets a transform spec declare what it accepts, or nothing", () => {
    const base = {
      archetype: "lookup",
      id: "t",
      input: Schema.Struct({ domain: Schema.String }),
      output: Schema.Struct({}),
      projection: "steps",
      sourceId: "s",
    } as const;
    assert.strictEqual(TransformSpec.make(base).accepts, undefined);
    const accepting = TransformSpec.make({
      ...base,
      accepts: TransformAccepts.make({ field: "domain", kind: "domain" }),
    });
    assert.strictEqual(accepting.accepts?.kind, "domain");
  });

  it("defaults to both tool kinds and bounded caps", () => {
    assert.deepStrictEqual([...TREE_DEFAULTS.kinds], ["passive", "active"]);
    assert.isAbove(TREE_DEFAULTS.maxDepth, 0);
    assert.isAbove(TREE_DEFAULTS.maxEntities, 0);
  });
});
