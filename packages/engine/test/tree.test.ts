import { assert, describe, it } from "@effect/vitest";
import type { Step as StepType } from "@viokit/schema";
import {
  AddEntity,
  AddRelation,
  Entity,
  ExpandRequest,
  entityId,
  evidenceId,
  Identifier,
  NonEmptyEvidenceIds,
  Relation,
  relationId,
  SpatialExtent,
  Step,
  stepId,
  TemporalExtent,
  TransformError,
} from "@viokit/schema";
import { Effect } from "effect";
import { makeMemoryRunLog } from "../src/run-log.js";
import {
  expand,
  readTree,
  type TreePort,
  type TreeTransform,
} from "../src/tree.js";

/**
 * The expander against a scripted world: what each (transform, input) returns
 * is written down here, so every behaviour is deterministic and nothing runs a
 * tool.
 */

const UNBOUNDED = TemporalExtent.make({
  validFrom: new Date(0),
  validTo: new Date("9999-12-31T00:00:00.000Z"),
});
const HERE = SpatialExtent.make({ lat: 0, lon: 0 });
let counter = 0;

const entityStep = (kind: string, value: string): StepType => {
  counter += 1;
  return Step.make({
    evidenceIds: NonEmptyEvidenceIds.make([evidenceId("e")]),
    id: stepId(`s${counter}`),
    operation: AddEntity.make({
      entity: Entity.make({
        id: entityId(kind === "open-port" ? `open-port:${value}` : value),
        identifiers: [Identifier.make({ kind, value })],
        kind,
        spatialExtent: HERE,
        temporalExtent: UNBOUNDED,
      }),
    }),
  });
};

const relationStep = (from: string, to: string, type: string): StepType => {
  counter += 1;
  return Step.make({
    evidenceIds: NonEmptyEvidenceIds.make([evidenceId("e")]),
    id: stepId(`s${counter}`),
    operation: AddRelation.make({
      relation: Relation.make({
        id: relationId(`${from}->${to}:${type}`),
        sourceId: entityId(from),
        targetId: entityId(to),
        temporalExtent: UNBOUNDED,
        type,
      }),
    }),
  });
};

const transform = (
  id: string,
  kind: string,
  field: string,
  toolKind: "passive" | "active" = "passive"
): TreeTransform => ({
  accepts: { field, kind },
  id,
  sourceId: `${id}-source`,
  toolKind,
});

const TRANSFORMS = [
  transform("dns", "domain", "domain"),
  transform("whois", "domain", "domain"),
  transform("nmap", "ip-address", "ip", "active"),
  transform("keyed", "domain", "domain"),
];

const WORLD: Record<string, () => readonly StepType[]> = {
  // Reaches an address already found: it must not be added to the tree again.
  "dns|ns1.seed.test": () => [entityStep("ip-address", "1.1.1.1")],
  "dns|seed.test": () => [
    entityStep("ip-address", "1.1.1.1"),
    entityStep("ip-address", "2.2.2.2"),
    relationStep("seed.test", "1.1.1.1", "resolves-to"),
  ],
  "nmap|1.1.1.1": () => [entityStep("open-port", "1.1.1.1:22/tcp")],
  "whois|seed.test": () => [entityStep("domain", "ns1.seed.test")],
};

interface Harness {
  readonly calls: string[];
  readonly inserted: StepType[];
  readonly port: TreePort;
}

const harness = (
  options: {
    readonly failing?: readonly string[];
    readonly world?: Record<string, () => readonly StepType[]>;
    readonly tickMs?: number;
    readonly transforms?: readonly TreeTransform[];
  } = {}
): Harness => {
  const calls: string[] = [];
  const inserted: StepType[] = [];
  let clock = 0;
  const world = options.world ?? WORLD;
  const port: TreePort = {
    ingestSeed: () =>
      Effect.succeed({ id: evidenceId("seed-evidence") } as never),
    insert: (step) => {
      inserted.push(step);
      return Effect.succeed(step);
    },
    investigation: Effect.succeed("case-1"),
    nowMs: Effect.sync(() => {
      clock += options.tickMs ?? 1;
      return clock;
    }),
    run: (transformId, input) => {
      const value = Object.values(input as Record<string, string>)[0] ?? "";
      const key = `${transformId}|${value}`;
      calls.push(key);
      if (options.failing?.includes(key)) {
        return Effect.fail(TransformError.make({ message: `${key} broke` }));
      }
      return Effect.succeed(world[key]?.() ?? []);
    },
    runLog: makeMemoryRunLog(),
    sourceStatus: (sourceId) =>
      Effect.succeed(
        sourceId === "keyed-source"
          ? { reason: "needs a credential", runnable: false }
          : { runnable: true }
      ),
    transforms: options.transforms ?? TRANSFORMS,
  };
  return { calls, inserted, port };
};

const request = (extra: Partial<ExpandRequest> = {}) =>
  ExpandRequest.make({ seedKind: "domain", seedValue: "seed.test", ...extra });

describe("seeding", () => {
  it.effect("records the seed with evidence before anything runs", () =>
    Effect.gen(function* () {
      const { inserted, port } = harness();
      yield* expand(port, request());
      const [seed] = inserted;
      assert.strictEqual(seed?.operation._tag, "AddEntity");
      assert.deepStrictEqual([...(seed?.evidenceIds ?? [])], ["seed-evidence"]);
    })
  );

  it.effect("refuses a seed no transform accepts", () =>
    Effect.gen(function* () {
      const { port } = harness();
      const outcome = yield* Effect.result(
        expand(port, request({ seedKind: "organization" }))
      );
      assert.strictEqual(outcome._tag, "Failure");
    })
  );
});

describe("expansion", () => {
  it.effect("expands discovered entities and runs each pair once", () =>
    Effect.gen(function* () {
      const { calls, port } = harness();
      const summary = yield* expand(port, request());
      // seed: dns, whois. ns1: dns, whois. 1.1.1.1 and 2.2.2.2: nmap each.
      assert.deepStrictEqual([...calls].sort(), [
        "dns|ns1.seed.test",
        "dns|seed.test",
        "nmap|1.1.1.1",
        "nmap|2.2.2.2",
        "whois|ns1.seed.test",
        "whois|seed.test",
      ]);
      assert.strictEqual(summary.runs, 6);
      assert.strictEqual(summary.stoppedBecause, "exhausted");
    })
  );

  it.effect("counts an entity reached twice once, at its shorter depth", () =>
    Effect.gen(function* () {
      const { port } = harness();
      const summary = yield* expand(port, request());
      // seed, 2 addresses, ns1, and 1.1.1.1's open port: 1.1.1.1 is not doubled.
      assert.strictEqual(summary.entities, 5);
      assert.deepStrictEqual(summary.entitiesByKind, {
        domain: 2,
        "ip-address": 2,
        "open-port": 1,
      });
    })
  );

  it.effect("records a failed run and continues with the others", () =>
    Effect.gen(function* () {
      const { calls, port } = harness({ failing: ["nmap|2.2.2.2"] });
      const summary = yield* expand(port, request());
      assert.strictEqual(summary.failed, 1);
      assert.strictEqual(summary.runs, 6);
      assert.include(calls, "nmap|1.1.1.1");
      const records = yield* port.runLog.list("case-1");
      const failed = records.find((one) => one.outcome === "failed");
      assert.strictEqual(failed?.transformId, "nmap");
      assert.include(failed?.message ?? "", "nmap|2.2.2.2 broke");
    })
  );

  it.effect("skips an unrunnable source once, not per entity", () =>
    Effect.gen(function* () {
      const { calls, port } = harness();
      const summary = yield* expand(port, request());
      assert.deepStrictEqual(
        summary.skipped.map((one) => one.transformId),
        ["keyed"]
      );
      assert.include(summary.skipped[0]?.reason ?? "", "needs a credential");
      assert.isFalse(calls.some((one) => one.startsWith("keyed|")));
    })
  );

  it.effect("runs only passive tools under a passive-only policy", () =>
    Effect.gen(function* () {
      const { calls, port } = harness();
      const summary = yield* expand(port, request({ kinds: ["passive"] }));
      assert.isFalse(calls.some((one) => one.startsWith("nmap|")));
      const nmap = summary.skipped.find((one) => one.transformId === "nmap");
      assert.include(nmap?.reason ?? "", "policy");
    })
  );

  it.effect("runs active and passive tools by default", () =>
    Effect.gen(function* () {
      const { calls, port } = harness();
      yield* expand(port, request());
      assert.isTrue(calls.some((one) => one.startsWith("nmap|")));
    })
  );

  it.effect("writes a run record for every run, with its additions", () =>
    Effect.gen(function* () {
      const { port } = harness();
      yield* expand(port, request());
      const records = yield* port.runLog.list("case-1");
      const dns = records.find(
        (one) => one.transformId === "dns" && one.inputEntityId === "seed.test"
      );
      assert.deepStrictEqual(
        dns?.addedEntities.map((one) => one.id),
        ["1.1.1.1", "2.2.2.2"]
      );
      assert.strictEqual(dns?.addedRelationCount, 1);
      assert.strictEqual(dns?.depth, 0);
      assert.strictEqual(records.length, 7);
    })
  );
});

describe("caps", () => {
  it.effect("stops at the depth cap and says so", () =>
    Effect.gen(function* () {
      const { calls, port } = harness();
      const summary = yield* expand(port, request({ maxDepth: 1 }));
      assert.strictEqual(summary.stoppedBecause, "depth");
      assert.isFalse(calls.some((one) => one.startsWith("nmap|")));
    })
  );

  it.effect("stops at the run cap", () =>
    Effect.gen(function* () {
      const { port } = harness();
      const summary = yield* expand(port, request({ maxRuns: 2 }));
      assert.strictEqual(summary.runs, 2);
      assert.strictEqual(summary.stoppedBecause, "runs");
    })
  );

  it.effect("stops at the entity cap", () =>
    Effect.gen(function* () {
      const { port } = harness();
      const summary = yield* expand(port, request({ maxEntities: 3 }));
      assert.strictEqual(summary.stoppedBecause, "entities");
    })
  );

  it.effect(
    "does not run anything once the seed alone reaches the entity cap",
    () =>
      Effect.gen(function* () {
        const { calls, port } = harness();
        const summary = yield* expand(port, request({ maxEntities: 1 }));
        assert.strictEqual(summary.runs, 0);
        assert.strictEqual(calls.length, 0);
        assert.strictEqual(summary.stoppedBecause, "entities");
      })
  );

  it.effect("stops at the time cap", () =>
    Effect.gen(function* () {
      const { port } = harness({ tickMs: 10 });
      const summary = yield* expand(port, request({ maxMs: 60 }));
      assert.strictEqual(summary.stoppedBecause, "time");
    })
  );
});

describe("reading the tree", () => {
  it.effect("nests runs under the entities that caused them", () =>
    Effect.gen(function* () {
      const { port } = harness();
      yield* expand(port, request());
      const roots = yield* readTree(port);
      assert.strictEqual(roots.length, 1);
      const [seed] = roots;
      assert.strictEqual(seed?.entityId, "seed.test");
      const dns = seed?.runs.find((one) => one.transformId === "dns");
      assert.deepStrictEqual(
        dns?.children.map((one) => one.entityId),
        ["1.1.1.1", "2.2.2.2"]
      );
      // 1.1.1.1 was found by the seed's dns run, so nmap hangs under it there.
      const address = dns?.children.find((one) => one.entityId === "1.1.1.1");
      assert.deepStrictEqual(
        address?.runs.map((one) => one.transformId),
        ["nmap"]
      );
    })
  );

  it.effect("shows every entity exactly once", () =>
    Effect.gen(function* () {
      const { port } = harness();
      const summary = yield* expand(port, request());
      const roots = yield* readTree(port);
      const count = (node: (typeof roots)[number]): number =>
        1 +
        node.runs.reduce(
          (sum, run) =>
            sum +
            run.children.reduce((inner, child) => inner + count(child), 0),
          0
        );
      assert.strictEqual(
        roots.reduce((sum, root) => sum + count(root), 0),
        summary.entities
      );
    })
  );
});
