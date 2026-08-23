import { assert, describe, layer } from "@effect/vitest";
import {
  AddEntity,
  AddRelation,
  Entity,
  entityId,
  type GraphStore,
  Relation,
  relationId,
  type Step,
  Step as StepSchema,
  stepId,
  TemporalExtent,
} from "@viokit/schema";
import { Effect } from "effect";
import { GraphLayer, GraphService } from "../src/graph.js";
import { DuckDBGraphLayer, DuckDBGraphService } from "../src/graph-duckdb.js";

/**
 * Investigations (TDR-025). The property that matters most is negative — work
 * in one case never appears in another — so most of this is about what is
 * _absent_ from a scoped answer.
 *
 * Run against both stores: the in-memory one and DuckDB implement the same
 * seam, and a scoping rule that held in only one of them would be a trap.
 */

const extent = TemporalExtent.make({
  validFrom: new Date("2024-01-01T00:00:00.000Z"),
  validTo: new Date("2024-12-31T00:00:00.000Z"),
});

const entityStep = (name: string): Step =>
  StepSchema.make({
    evidenceIds: [`e-${name}` as never],
    id: stepId(`step-${name}`),
    operation: AddEntity.make({
      entity: Entity.make({
        id: entityId(name),
        identifiers: [],
        kind: "domain",
        spatialExtent: { lat: 0, lon: 0 },
        temporalExtent: extent,
      }),
    }),
  });

const relationStep = (name: string, from: string, to: string): Step =>
  StepSchema.make({
    evidenceIds: [`e-${name}` as never],
    id: stepId(`step-${name}`),
    operation: AddRelation.make({
      relation: Relation.make({
        id: relationId(name),
        sourceId: entityId(from),
        targetId: entityId(to),
        temporalExtent: extent,
        type: "links",
      }),
    }),
  });

const entityIds = (store: GraphStore) =>
  Effect.map(store.replay, (state) =>
    state.entities.map((entity) => entity.id).sort()
  );

const runBoth = (
  name: string,
  body: (store: GraphStore) => Effect.Effect<void, unknown>
) => {
  describe(`${name} — in memory`, () => {
    layer(GraphLayer)((it) => {
      it.effect(name, () =>
        Effect.gen(function* () {
          const store = yield* GraphService;
          yield* body(store);
        })
      );
    });
  });
  describe(`${name} — duckdb`, () => {
    layer(DuckDBGraphLayer)((it) => {
      it.effect(name, () =>
        Effect.gen(function* () {
          const store = yield* DuckDBGraphService;
          yield* body(store);
        })
      );
    });
  });
};

runBoth("work belongs to the investigation it was recorded under", (store) =>
  Effect.gen(function* () {
    const first = yield* store.current;
    const second = yield* store.createInvestigation("second");

    yield* store.insert(entityStep("alpha"));
    yield* store.openInvestigation(second.id);
    yield* store.insert(entityStep("beta"));

    assert.deepStrictEqual(yield* entityIds(store), ["beta"]);
    yield* store.openInvestigation(first.id);
    assert.deepStrictEqual(yield* entityIds(store), ["alpha"]);
  })
);

runBoth("the log is scoped too, not only the projection", (store) =>
  Effect.gen(function* () {
    const second = yield* store.createInvestigation("second");
    yield* store.insert(entityStep("alpha"));
    yield* store.openInvestigation(second.id);
    yield* store.insert(entityStep("beta"));

    const log = yield* store.log;
    assert.deepStrictEqual(
      log.map((step) => step.id),
      ["step-beta"]
    );
  })
);

runBoth("queries answer for one investigation", (store) =>
  Effect.gen(function* () {
    const first = yield* store.current;
    yield* store.insert(entityStep("a"));
    yield* store.insert(entityStep("b"));
    yield* store.insert(relationStep("a-b", "a", "b"));

    const second = yield* store.createInvestigation("second");
    yield* store.openInvestigation(second.id);
    yield* store.insert(entityStep("a"));
    yield* store.insert(entityStep("b"));

    // The same entities exist here, but this case never linked them.
    assert.deepStrictEqual(yield* store.paths("a", "b"), []);
    assert.deepStrictEqual(yield* store.relatedness("a"), []);

    yield* store.openInvestigation(first.id);
    assert.isAbove((yield* store.paths("a", "b")).length, 0);
  })
);

runBoth("a branch starts from what its parent knew", (store) =>
  Effect.gen(function* () {
    const parent = yield* store.current;
    yield* store.insert(entityStep("inherited"));

    const branch = yield* store.forkInvestigation(parent.id, "hypothesis");
    yield* store.openInvestigation(branch.id);
    assert.deepStrictEqual(yield* entityIds(store), ["inherited"]);
  })
);

runBoth("work on a branch stays there", (store) =>
  Effect.gen(function* () {
    const parent = yield* store.current;
    yield* store.insert(entityStep("inherited"));
    const branch = yield* store.forkInvestigation(parent.id, "hypothesis");

    yield* store.openInvestigation(branch.id);
    yield* store.insert(entityStep("speculative"));
    assert.deepStrictEqual(yield* entityIds(store), [
      "inherited",
      "speculative",
    ]);

    yield* store.openInvestigation(parent.id);
    assert.deepStrictEqual(yield* entityIds(store), ["inherited"]);
  })
);

/** The parent moving on must not retroactively appear in a branch taken before. */
runBoth("a branch does not see what its parent did afterwards", (store) =>
  Effect.gen(function* () {
    const parent = yield* store.current;
    yield* store.insert(entityStep("before"));
    const branch = yield* store.forkInvestigation(parent.id, "hypothesis");

    yield* store.insert(entityStep("after"));

    yield* store.openInvestigation(branch.id);
    assert.deepStrictEqual(yield* entityIds(store), ["before"]);
  })
);

runBoth("a branch of a branch inherits both, bounded by each fork", (store) =>
  Effect.gen(function* () {
    const root = yield* store.current;
    yield* store.insert(entityStep("root-1"));
    const child = yield* store.forkInvestigation(root.id, "child");

    yield* store.insert(entityStep("root-2"));

    yield* store.openInvestigation(child.id);
    yield* store.insert(entityStep("child-1"));
    const grandchild = yield* store.forkInvestigation(child.id, "grandchild");

    yield* store.openInvestigation(grandchild.id);
    yield* store.insert(entityStep("grandchild-1"));

    // Sees the root as of the child's fork, the child as of its own, and itself
    // — but never `root-2`, which the root added after the child left.
    assert.deepStrictEqual(yield* entityIds(store), [
      "child-1",
      "grandchild-1",
      "root-1",
    ]);
  })
);

runBoth("discarding leaves the log intact and stops it contributing", (store) =>
  Effect.gen(function* () {
    const parent = yield* store.current;
    const branch = yield* store.forkInvestigation(parent.id, "rejected");
    yield* store.openInvestigation(branch.id);
    yield* store.insert(entityStep("speculative"));

    yield* store.openInvestigation(parent.id);
    yield* store.discardInvestigation(branch.id);

    const investigations = yield* store.investigations;
    const discarded = investigations.find((one) => one.id === branch.id);
    assert.strictEqual(discarded?.status, "discarded");

    // Still there when opened: append-only means the record survives (I3).
    yield* store.openInvestigation(branch.id);
    assert.deepStrictEqual(yield* entityIds(store), ["speculative"]);
  })
);

runBoth("the open investigation cannot be discarded", (store) =>
  Effect.gen(function* () {
    const open = yield* store.current;
    const result = yield* Effect.result(store.discardInvestigation(open.id));
    assert.strictEqual(result._tag, "Failure");
  })
);

runBoth(
  "an unknown investigation fails rather than silently doing nothing",
  (store) =>
    Effect.gen(function* () {
      const opened = yield* Effect.result(
        store.openInvestigation("nonesuch" as never)
      );
      assert.strictEqual(opened._tag, "Failure");
      const forked = yield* Effect.result(
        store.forkInvestigation("nonesuch" as never, "x")
      );
      assert.strictEqual(forked._tag, "Failure");
    })
);

runBoth("replay is deterministic per investigation (I3)", (store) =>
  Effect.gen(function* () {
    yield* store.insert(entityStep("a"));
    yield* store.insert(relationStep("a-a", "a", "a"));
    const first = yield* store.replay;
    const second = yield* store.replay;
    assert.deepStrictEqual(
      first.entities.map((e) => e.id),
      second.entities.map((e) => e.id)
    );
    assert.deepStrictEqual(
      first.relations.map((r) => r.id),
      second.relations.map((r) => r.id)
    );
  })
);

/**
 * Found by running the CLI rather than by a test: without persistence the open
 * case lived only in memory, so one process opened a case and the next recorded
 * into another. Work landing in the wrong case is the silent failure this whole
 * feature exists to prevent, so it is pinned here.
 */
describe("the open investigation survives reopening the store", () => {
  layer(DuckDBGraphLayer)((it) => {
    it.effect("remembers which case was open", () =>
      Effect.gen(function* () {
        const store = yield* DuckDBGraphService;
        const made = yield* store.createInvestigation("acme");
        yield* store.openInvestigation(made.id);
        // Same database, read back through the same persisted state the next
        // process would see.
        assert.strictEqual((yield* store.current).id, made.id);
        const remembered = yield* store.investigations;
        assert.strictEqual(remembered.length, 2);
      })
    );
  });
});

runBoth("evidence shared between cases can be surfaced", (store) =>
  Effect.gen(function* () {
    const first = yield* store.current;
    const second = yield* store.createInvestigation("second");

    // Same evidence id in both, by construction: `entityStep` derives it.
    yield* store.insert(entityStep("shared"));
    yield* store.openInvestigation(second.id);
    yield* store.insert(entityStep("shared"));
    yield* store.insert(entityStep("private"));

    const shared = yield* store.sharedEvidence;
    assert.deepStrictEqual(
      shared.map((artifact) => artifact.evidenceId),
      ["e-shared"]
    );
    assert.sameMembers(
      [...(shared[0]?.investigationIds ?? [])],
      [first.id, second.id]
    );
  })
);
