import {
  type CorrelateResolver,
  CorrelateResolverService,
  type Entity,
  type GraphState,
  type MatchBasis,
  type MatchRule,
  type Normalization,
  ResolveEntity,
  Step,
  stepId,
} from "@viokit/schema";
import { Context, Effect, Layer } from "effect";
import { fnv1aHex } from "./hash.js";

const applyNormalization = (
  value: string,
  steps: readonly Normalization[]
): string => {
  let out = value;
  for (const step of steps) {
    switch (step) {
      case "trim":
        out = out.trim();
        break;
      case "lower":
        out = out.toLowerCase();
        break;
      case "stripPunctuation":
        out = out.replace(/[^\p{L}\p{N}\s]/gu, "");
        break;
      case "collapseWhitespace":
        out = out.replace(/\s+/g, " ").trim();
        break;
      default:
        break;
    }
  }
  return out;
};

const normalizationsFor = (
  kind: string,
  rules: readonly MatchRule[]
): readonly Normalization[] => {
  const rule = rules.find((candidate) => candidate.identifierKind === kind);
  return rule?.normalizations ?? [];
};

const canonicalValue = (
  value: string,
  kind: string,
  rules: readonly MatchRule[]
): string => applyNormalization(value, normalizationsFor(kind, rules));

const identifierKey = (
  kind: string,
  value: string,
  rules: readonly MatchRule[]
): string => `${kind}\u0000${canonicalValue(value, kind, rules)}`;

/** Build `(kind\u0000normValue) -> existing entity` index over the graph. */
const buildIndex = (
  existing: GraphState,
  rules: readonly MatchRule[]
): Map<string, Entity> => {
  const index = new Map<string, Entity>();
  for (const entity of existing.entities) {
    for (const identifier of entity.identifiers) {
      index.set(
        identifierKey(identifier.kind, identifier.value, rules),
        entity
      );
    }
  }
  return index;
};

/**
 * TDR-015 entity resolution. Builds an index of existing vertices keyed by
 * `(identifierKind, normalizedValue) -> Entity`. For each staged `AddEntity`,
 * lookups each of its (normalized) identifiers; on the first hit, emits a
 * `ResolveEntity` merge step: `mergeId` = the staged (newer) entity,
 * `canonicalId` = the existing vertex, with the matched normalized basis
 * recorded (I2). Matching is strict/deterministic (I3); confidence is 1.0 for
 * the P2 baseline. The open-domain rule is preserved: calling layers supply
 * the `rules`; core ships no domain match rules (the empty-rules default
 * matches on raw identifier equality).
 */
export class CorrelateService extends Context.Service<
  CorrelateService,
  CorrelateResolver
>()("CorrelateService", {
  make: Effect.gen(function* () {
    let counter = 0;

    const mergeSteps = (
      staged: readonly Step[],
      index: Map<string, Entity>,
      rules: readonly MatchRule[]
    ): Step[] => {
      const merges: Step[] = [];
      for (const step of staged) {
        if (step.operation._tag !== "AddEntity") {
          continue;
        }
        const { entity } = step.operation;
        const found = entity.identifiers
          .map((identifier) => ({
            basis: {
              identifierKind: identifier.kind,
              normalizedValue: canonicalValue(
                identifier.value,
                identifier.kind,
                rules
              ),
            } satisfies MatchBasis,
            canonical: index.get(
              identifierKey(identifier.kind, identifier.value, rules)
            ),
          }))
          .find(
            (
              candidate
            ): candidate is { basis: MatchBasis; canonical: Entity } =>
              candidate.canonical !== undefined &&
              candidate.canonical.id !== entity.id
          );
        if (found === undefined) {
          continue;
        }
        merges.push(
          Step.make({
            evidenceIds: step.evidenceIds,
            id: stepId(
              fnv1aHex(new TextEncoder().encode(`resolve:${counter}`))
            ),
            operation: ResolveEntity.make({
              canonicalId: found.canonical.id,
              confidence: 1,
              matchBasis: [found.basis],
              mergeId: entity.id,
            }),
          })
        );
        counter += 1;
      }
      return merges;
    };

    return {
      resolve: (staged, existing, rules) =>
        Effect.sync(() =>
          mergeSteps(staged, buildIndex(existing, rules), rules)
        ),
    } satisfies CorrelateResolver;
  }),
}) {}

export const CorrelateLayer = Layer.effect(
  CorrelateResolverService,
  CorrelateService.make
);
