import { assert, describe, it } from "vitest";
import type { StepRecord } from "../src/provenance.js";
import {
  decodeContent,
  describeAcquisition,
  describeOperation,
  describeOrigin,
  isPreviewable,
  stepsFor,
  stepsForSubject,
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
    relation: {
      id: "r-acme",
      sourceId: "acme.test",
      targetId: "cert:acme.test",
    },
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
    assert.include(describeOperation(log[3] as StepRecord), "acme.test");
  });

  it("names both ends of a relation it asserted", () => {
    const described = describeOperation(log[2] as StepRecord);
    assert.include(described, "acme.test");
    assert.include(described, "cert:acme.test");
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

describe("describing what produced a step (I7)", () => {
  it("names the transform and the versioned source", () => {
    const described = describeOrigin({
      evidenceIds: ["e1"],
      id: "s1",
      operation: { _tag: "AddEntity" },
      sourceId: "crt.sh",
      sourceVersion: "2024-06",
      transformId: "crt-sh-certificate-search",
    });
    assert.include(described ?? "", "crt-sh-certificate-search");
    assert.include(described ?? "", "crt.sh");
    assert.include(described ?? "", "2024-06");
  });

  it("says unversioned rather than implying currency", () => {
    const described = describeOrigin({
      evidenceIds: ["e1"],
      id: "s1",
      operation: { _tag: "AddEntity" },
      sourceId: "crt.sh",
      sourceVersion: "unversioned",
      transformId: "t",
    });
    assert.include(described ?? "", "unversioned");
    assert.notInclude(described ?? "", "version unversioned");
  });

  it("claims nothing for a step that records no origin", () => {
    assert.isNull(
      describeOrigin({
        evidenceIds: ["e1"],
        id: "s1",
        operation: { _tag: "ResolveEntity" },
      })
    );
  });
});

describe("provenance is scoped to the selected subject", () => {
  it("a relation finds the step that asserted it, not its neighbours'", () => {
    const found = stepsForSubject(log, { id: "r-acme", kind: "relation" });
    assert.deepStrictEqual(
      found.map((s) => s.id),
      ["s3"]
    );
  });

  it("an entity still finds every step naming it", () => {
    const found = stepsForSubject(log, { id: "acme.test", kind: "entity" });
    assert.deepStrictEqual(
      found.map((s) => s.id),
      ["s1", "s3", "s4"]
    );
  });

  it("a subject with no steps reports none", () => {
    assert.deepStrictEqual(
      stepsForSubject(log, { id: "r-unknown", kind: "relation" }),
      []
    );
  });

  it("an event finds the step that recorded it", () => {
    const withEvent = [
      ...log,
      {
        evidenceIds: ["e1"],
        id: "s5",
        operation: {
          _tag: "AddEvent",
          event: { entityIds: ["acme.test"], id: "ev1" },
        },
      } as StepRecord,
    ];
    assert.deepStrictEqual(
      stepsForSubject(withEvent, { id: "ev1", kind: "event" }).map((s) => s.id),
      ["s5"]
    );
    // and the entity it involves sees it too
    assert.include(
      stepsForSubject(withEvent, { id: "acme.test", kind: "entity" }).map(
        (s) => s.id
      ),
      "s5"
    );
  });
});
