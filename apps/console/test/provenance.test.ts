import { assert, describe, it } from "vitest";
import type { StepRecord } from "../src/provenance.js";
import {
  decodeContent,
  describeAcquisition,
  describeOperation,
  isPreviewable,
  stepsFor,
} from "../src/provenance.js";

const step = (
  id: string,
  operation: StepRecord["operation"],
  evidenceIds: string[] = ["e1"]
): StepRecord => ({ evidenceIds, id, operation });

const log: StepRecord[] = [
  step("s1", { _tag: "AddEntity", entity: { id: "acme.test" } }),
  step("s2", { _tag: "AddEntity", entity: { id: "other.test" } }),
  step("s3", {
    _tag: "AddRelation",
    relation: { sourceId: "acme.test", targetId: "cert:acme.test" },
  }),
  step("s4", {
    _tag: "ResolveEntity",
    canonicalId: "acme.test",
    mergeId: "dupe.test",
  }),
];

describe("finding the steps that produced an entity", () => {
  it("picks the step that added it", () => {
    const found = stepsFor(log, "other.test");
    assert.deepStrictEqual(
      found.map((s) => s.id),
      ["s2"]
    );
  });

  it("includes relations at either end", () => {
    assert.include(
      stepsFor(log, "cert:acme.test").map((s) => s.id),
      "s3"
    );
    assert.include(
      stepsFor(log, "acme.test").map((s) => s.id),
      "s3"
    );
  });

  it("includes merges from either side", () => {
    assert.include(
      stepsFor(log, "dupe.test").map((s) => s.id),
      "s4"
    );
    assert.include(
      stepsFor(log, "acme.test").map((s) => s.id),
      "s4"
    );
  });

  it("returns nothing for an entity the log never names", () => {
    assert.deepStrictEqual(stepsFor(log, "unknown.test"), []);
  });

  it("preserves log order", () => {
    assert.deepStrictEqual(
      stepsFor(log, "acme.test").map((s) => s.id),
      ["s1", "s3", "s4"]
    );
  });
});

describe("describing how evidence was acquired", () => {
  it("names the retriever and origin of a manual acquisition", () => {
    const described = describeAcquisition({
      _tag: "manual",
      by: "ed",
      ref: "https://portal.test/x",
    });
    assert.include(described, "by hand");
    assert.include(described, "ed");
    assert.include(described, "portal.test");
  });

  it("still says a person retrieved it when none is named", () => {
    assert.include(describeAcquisition({ _tag: "manual" }), "a person");
  });

  it("distinguishes live, cache, and proxy", () => {
    assert.include(describeAcquisition({ _tag: "live" }), "live");
    assert.include(describeAcquisition({ _tag: "cache" }), "cache");
    assert.include(describeAcquisition({ _tag: "proxy" }), "proxy");
  });

  it("falls back to the tag for anything unrecognised", () => {
    assert.strictEqual(describeAcquisition({ _tag: "future" }), "future");
  });
});

describe("describing what a step did", () => {
  it("describes each operation kind", () => {
    assert.include(describeOperation(log[0] as StepRecord), "added");
    assert.include(describeOperation(log[2] as StepRecord), "related");
    assert.include(describeOperation(log[3] as StepRecord), "acme.test");
  });
});

describe("previewing artifacts", () => {
  it("previews text and structured text", () => {
    assert.isTrue(isPreviewable("text/html"));
    assert.isTrue(isPreviewable("application/json"));
  });

  it("does not preview binary", () => {
    assert.isFalse(isPreviewable("application/octet-stream"));
    assert.isFalse(isPreviewable("image/png"));
  });

  it("decodes base64 content", () => {
    assert.strictEqual(
      decodeContent(btoa("a captured page")),
      "a captured page"
    );
  });

  it("yields nothing for malformed content rather than throwing", () => {
    assert.strictEqual(decodeContent("!!!not base64!!!"), "");
  });
});
