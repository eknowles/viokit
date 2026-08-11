import { assert, describe, layer } from "@effect/vitest";
import {
  AddEntity,
  CorrelateResolverService,
  Entity,
  entityId,
  GraphState,
  Identifier,
  MatchRule,
  Step,
  stepId,
  TemporalExtent,
} from "@viokit/schema";
import { Effect } from "effect";
import { CorrelateLayer } from "../src/correlate.js";

const identifier = (kind: string, value: string): Identifier =>
  Identifier.make({ kind, value });

const extent = TemporalExtent.make({
  validFrom: new Date("2024-01-01T00:00:00.000Z"),
  validTo: new Date("2024-01-01T00:00:00.000Z"),
});

const entity = (id: string, identifiers: Identifier[]): Entity =>
  Entity.make({
    id: entityId(id),
    identifiers,
    kind: "person",
    spatialExtent: { lat: 0, lon: 0 },
    temporalExtent: extent,
  });

const addEntityStep = (target: Entity, ev: string): Step =>
  Step.make({
    evidenceIds: [ev as never],
    id: stepId(`${ev}-s`),
    operation: AddEntity.make({ entity: target }),
  });

const rule = MatchRule.make({
  identifierKind: "email",
  normalizations: ["lower", "trim"],
});

const existing = GraphState.make({
  entities: [entity("existing", [identifier("email", "alice@example.com")])],
  events: [],
  relations: [],
});

describe("correlate resolver (TDR-015)", () => {
  layer(CorrelateLayer)((it) => {
    it.effect(
      "emits a ResolveEntity step when a normalized identifier matches (I2)",
      () =>
        Effect.gen(function* () {
          const resolver = yield* CorrelateResolverService;
          const staged = [
            addEntityStep(
              entity("dup", [identifier("email", "  ALICE@example.com  ")]),
              "ev-dup"
            ),
          ];
          const merges = yield* resolver.resolve(staged, existing, [rule]);
          assert.strictEqual(merges.length, 1);
          const [merge] = merges;
          assert.isDefined(merge);
          assert.strictEqual(merge.operation._tag, "ResolveEntity");
          if (merge.operation._tag === "ResolveEntity") {
            assert.strictEqual(merge.operation.canonicalId, "existing");
            assert.strictEqual(merge.operation.mergeId, "dup");
            assert.strictEqual(merge.operation.confidence, 1);
            const [basis] = merge.operation.matchBasis;
            assert.isDefined(basis);
            assert.strictEqual(basis.normalizedValue, "alice@example.com");
          }
          // The merge step carries the staged step's evidence (I2).
          assert.strictEqual(merge.evidenceIds.length, 1);
        })
    );

    it.effect(
      "does not merge when normalization still differs (no false merge)",
      () =>
        Effect.gen(function* () {
          const resolver = yield* CorrelateResolverService;
          const staged = [
            addEntityStep(
              entity("other", [identifier("email", "bob@example.com")]),
              "ev-other"
            ),
          ];
          const merges = yield* resolver.resolve(staged, existing, [rule]);
          assert.strictEqual(merges.length, 0);
        })
    );

    it.effect(
      "without rules, raw identifier equality must hold (P2 strict baseline)",
      () =>
        Effect.gen(function* () {
          const resolver = yield* CorrelateResolverService;
          const stagedExact = [
            addEntityStep(
              entity("dup", [identifier("email", "alice@example.com")]),
              "ev-dup"
            ),
          ];
          const exactMerges = yield* resolver.resolve(
            stagedExact,
            existing,
            []
          );
          assert.strictEqual(exactMerges.length, 1);

          // Raw inequality (different case) does NOT merge without rules.
          const stagedCase = [
            addEntityStep(
              entity("dup", [identifier("email", "ALICE@example.com")]),
              "ev-dup"
            ),
          ];
          const caseMerges = yield* resolver.resolve(stagedCase, existing, []);
          assert.strictEqual(caseMerges.length, 0);
        })
    );

    it.effect(
      "requires at least one shared normalized identifier (no over-merge)",
      () =>
        Effect.gen(function* () {
          const resolver = yield* CorrelateResolverService;
          const staged = [
            addEntityStep(
              entity("no-share", [identifier("email", "carol@example.com")]),
              "ev-carol"
            ),
          ];
          const merges = yield* resolver.resolve(staged, existing, [rule]);
          assert.strictEqual(merges.length, 0);
        })
    );
  });
});
