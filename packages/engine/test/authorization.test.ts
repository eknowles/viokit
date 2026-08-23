import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, layer, it as plainIt } from "@effect/vitest";
import {
  DuckDBConfig,
  type GraphStore,
  LOCAL_PRINCIPAL,
  Manual,
  principalId,
  SourceSpec,
  SourceTransportService,
} from "@viokit/schema";
import { Effect, Layer } from "effect";
import { Engine, makeEngineLayer } from "../src/engine.js";
import { EvidenceBackendMemory } from "../src/evidence-fs.js";
import { GraphLayer, GraphService } from "../src/graph.js";
import { DuckDBGraphLayer, DuckDBGraphService } from "../src/graph-duckdb.js";
import { OntologyRegistryLayer } from "../src/ontology.js";
import { makeViewStateLayer } from "../src/view-state.js";

/**
 * Authorization is membership of an investigation (TDR-023).
 *
 * The roadmap's exit criterion for this track is "an investigation that two
 * people can work on without seeing each other's material", so most of this is
 * about what the *other* principal cannot reach.
 */

const me = LOCAL_PRINCIPAL.id;
const other = principalId("other");

const probe = SourceSpec.make({
  id: "probe",
  transport: "http",
  url: "https://probe.test/endpoint",
});

const deployment = Layer.provide(
  makeEngineLayer([]),
  Layer.mergeAll(
    Layer.succeed(SourceTransportService, {
      fetch: () =>
        Effect.succeed({
          bytes: new TextEncoder().encode("acquired"),
          contentType: "text/plain",
        }),
    }),
    EvidenceBackendMemory,
    OntologyRegistryLayer,
    makeViewStateLayer(mkdtempSync(join(tmpdir(), "viokit-auth-vs-")))
  )
);

const runBoth = (
  name: string,
  body: (store: GraphStore) => Effect.Effect<void, unknown>
) => {
  describe(`${name} — in memory`, () => {
    layer(GraphLayer)((it) => {
      it.effect(name, () =>
        Effect.gen(function* () {
          yield* body(yield* GraphService);
        })
      );
    });
  });
  describe(`${name} — duckdb`, () => {
    layer(DuckDBGraphLayer)((it) => {
      it.effect(name, () =>
        Effect.gen(function* () {
          yield* body(yield* DuckDBGraphService);
        })
      );
    });
  });
};

runBoth("creating a case makes you its owner and only member", (store) =>
  Effect.gen(function* () {
    const made = yield* store.createInvestigation("mine", me);
    assert.strictEqual(made.owner, me);
    assert.deepStrictEqual([...made.members], [me]);
  })
);

runBoth("a case you are not party to cannot be opened", (store) =>
  Effect.gen(function* () {
    const made = yield* store.createInvestigation("mine", me);
    const result = yield* Effect.result(
      store.openInvestigation(made.id, other)
    );
    assert.strictEqual(result._tag, "Failure");
    if (result._tag === "Failure") {
      // A refusal, not an empty answer: "you may not reach this" and "this case
      // is empty" are different facts.
      assert.strictEqual(result.failure._tag, "Unauthorized");
    }
  })
);

runBoth("a case you are not party to is not even listed", (store) =>
  Effect.gen(function* () {
    yield* store.createInvestigation("mine", me);
    assert.deepStrictEqual(yield* store.investigations(other), []);
    assert.isAbove((yield* store.investigations(me)).length, 0);
  })
);

runBoth("a case you are not party to cannot be branched", (store) =>
  Effect.gen(function* () {
    const made = yield* store.createInvestigation("mine", me);
    const result = yield* Effect.result(
      store.forkInvestigation(made.id, "theirs", other)
    );
    assert.strictEqual(result._tag, "Failure");
  })
);

runBoth("only the owner may admit others", (store) =>
  Effect.gen(function* () {
    const made = yield* store.createInvestigation("mine", me);
    const refused = yield* Effect.result(
      store.addMember(made.id, other, other)
    );
    assert.strictEqual(refused._tag, "Failure");

    const widened = yield* store.addMember(made.id, other, me);
    assert.include([...widened.members], other);
  })
);

runBoth("an admitted principal can then reach the case", (store) =>
  Effect.gen(function* () {
    const made = yield* store.createInvestigation("mine", me);
    yield* store.addMember(made.id, other, me);

    const opened = yield* store.openInvestigation(made.id, other);
    assert.strictEqual(opened.id, made.id);
    assert.deepStrictEqual(
      (yield* store.investigations(other)).map((one) => one.id),
      [made.id]
    );
  })
);

runBoth("admitting someone twice does not duplicate them", (store) =>
  Effect.gen(function* () {
    const made = yield* store.createInvestigation("mine", me);
    yield* store.addMember(made.id, other, me);
    const again = yield* store.addMember(made.id, other, me);
    assert.strictEqual(again.members.filter((one) => one === other).length, 1);
  })
);

runBoth("only the owner may discard", (store) =>
  Effect.gen(function* () {
    const made = yield* store.createInvestigation("mine", me);
    yield* store.addMember(made.id, other, me);
    const refused = yield* Effect.result(
      store.discardInvestigation(made.id, other)
    );
    assert.strictEqual(refused._tag, "Failure");
  })
);

/** A branch is a case, so it is authorized like one — by its own membership. */
runBoth("a branch belongs to whoever took it", (store) =>
  Effect.gen(function* () {
    const parent = yield* store.createInvestigation("shared", me);
    yield* store.addMember(parent.id, other, me);

    const branch = yield* store.forkInvestigation(parent.id, "theirs", other);
    assert.strictEqual(branch.owner, other);

    // Its parent's owner is not automatically party to the hypothesis.
    const result = yield* Effect.result(store.openInvestigation(branch.id, me));
    assert.strictEqual(result._tag, "Failure");
  })
);

/**
 * Reopening a persisted store, which the rest of the suite never does: the tests
 * run in-memory, so `loadInvestigations` only ever ran against an empty table
 * and a missing `members` went unnoticed until the CLI dereferenced it.
 *
 * The type checker did not catch it either, because the row was built with an
 * `as Investigation` cast. It is constructed now.
 */
describe("an investigation read back from disk", () => {
  plainIt("keeps its owner and members", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "viokit-auth-")), "graph.db");
    const layered = Layer.provide(
      DuckDBGraphLayer,
      Layer.succeed(DuckDBConfig, path)
    );

    const made = await Effect.runPromise(
      Effect.scoped(
        Effect.provide(
          Effect.gen(function* () {
            const store = yield* DuckDBGraphService;
            const created = yield* store.createInvestigation("persisted", me);
            yield* store.addMember(created.id, other, me);
            yield* store.dispose;
            return created;
          }),
          layered
        )
      )
    );

    const reopened = await Effect.runPromise(
      Effect.scoped(
        Effect.provide(
          Effect.gen(function* () {
            const store = yield* DuckDBGraphService;
            return yield* store.investigations(other);
          }),
          layered
        )
      )
    );

    assert.deepStrictEqual(
      reopened.map((one) => one.id),
      [made.id]
    );
    assert.include([...(reopened[0]?.members ?? [])], other);
    assert.strictEqual(reopened[0]?.owner, me);
  });
});

/**
 * Custody (TDR-023's open question, half-answered).
 *
 * An export could already say the bytes are intact since it was written. What
 * it could not say is who obtained them, which is most of what custody means.
 */
describe("evidence records who acquired it", () => {
  layer(deployment)((it) => {
    it.effect("an acquisition carries the principal that made it", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const evidence = yield* engine.acquire(probe, other);
        assert.strictEqual(evidence.acquiredBy, other);
      })
    );

    /**
     * A manual submission carries two different facts, and conflating them
     * would lose the distinction that makes either worth having: `Manual.by` is
     * a self-asserted claim about who retrieved something by hand, and
     * `acquiredBy` is who the deployment authenticated.
     */
    it.effect("a manual submission keeps both who and who-says", () =>
      Effect.gen(function* () {
        const engine = yield* Engine;
        const evidence = yield* engine.ingest(
          {
            acquiredAt: new Date("2024-06-01T00:00:00.000Z"),
            acquisitionPath: Manual.make({ by: "a colleague, by hand" }),
            bytes: new TextEncoder().encode("retrieved by hand"),
            contentType: "text/plain",
            observedAt: new Date("2024-06-01T00:00:00.000Z"),
          },
          me
        );
        assert.strictEqual(evidence.acquiredBy, me);
        assert.strictEqual(
          evidence.acquisitionPath._tag === "manual"
            ? evidence.acquisitionPath.by
            : null,
          "a colleague, by hand"
        );
      })
    );
  });
});
