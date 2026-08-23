import type { CandidateNotFound, SourceCandidate } from "@viokit/schema";
import {
  AccessObservation,
  AlreadyPromoted,
  SourceCandidateId,
  SourceCandidateInput,
} from "@viokit/schema";
import { Context, Effect, Layer, Option, Schema } from "effect";
import type { SqlError } from "effect/unstable/sql/SqlError";
import type { PromotionError, WorkUnit } from "./seams.js";
import {
  CandidateFilterSchema,
  CandidatePatchSchema,
  CandidateStoreService,
  PromoterService,
  Unverified,
  ValidationError,
  WorkQueueService,
} from "./seams.js";
import { discoveryUnits } from "./seed.js";

/**
 * The agent-facing discovery API, shared verbatim by the MCP server and CLI
 * (I8). Variable payloads are `unknown` at the boundary and decoded here so the
 * schema is the single source of truth (I6).
 */
export interface SourceCatalog {
  readonly claimWork: (
    agent: string
  ) => Effect.Effect<Option.Option<WorkUnit>, SqlError>;
  readonly enrichCandidate: (
    id: unknown,
    patch: unknown
  ) => Effect.Effect<
    SourceCandidate,
    CandidateNotFound | ValidationError | SqlError
  >;
  readonly listCandidates: (
    filter: unknown
  ) => Effect.Effect<readonly SourceCandidate[], ValidationError | SqlError>;
  readonly promoteSource: (
    id: unknown,
    spec: unknown,
    observation: unknown
  ) => Effect.Effect<
    SourceCandidate,
    | CandidateNotFound
    | AlreadyPromoted
    | ValidationError
    | Unverified
    | PromotionError
    | SqlError
  >;
  readonly seed: () => Effect.Effect<number, SqlError>;
  readonly submitCandidate: (
    input: unknown
  ) => Effect.Effect<
    SourceCandidate,
    CandidateNotFound | ValidationError | SqlError
  >;
  readonly supersede: (
    oldId: unknown,
    replacementId: unknown
  ) => Effect.Effect<
    SourceCandidate,
    CandidateNotFound | ValidationError | SqlError
  >;
}

const decode = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  input: unknown
): Effect.Effect<S["Type"], ValidationError> =>
  Effect.try({
    catch: (cause) => new ValidationError({ message: String(cause) }),
    try: () => Schema.decodeUnknownSync(schema)(input),
  });

const decodeInput = (input: unknown) => decode(SourceCandidateInput, input);
const decodePatch = (patch: unknown) => decode(CandidatePatchSchema, patch);
const decodeFilter = (filter: unknown) => decode(CandidateFilterSchema, filter);
const decodeId = (id: unknown) => decode(SourceCandidateId, id);
const decodeObservation = (value: unknown) => decode(AccessObservation, value);

/**
 * A promotion has to carry a classification somebody checked. The catalog can
 * see that the observation concluded something and names the artifacts it was
 * derived from; it cannot read those artifacts, which live in the evidence
 * store on the other side of a deliberate package boundary. So this verifies
 * the claim's shape and content, and the evidence ids are what let anyone with
 * the store check the rest.
 */
const requireVerified = (
  candidateId: string,
  observation: AccessObservation
): Effect.Effect<void, Unverified> => {
  if (observation.sourceId !== candidateId) {
    return new Unverified({
      message: `verification is for '${observation.sourceId}', not '${candidateId}'`,
    });
  }
  if (observation.observed === "unknown") {
    return new Unverified({
      message: `'${candidateId}' was probed but nothing could be concluded: ${observation.reason}`,
    });
  }
  if (observation.evidence.length === 0) {
    return new Unverified({
      message: `verification of '${candidateId}' names no evidence, so it cannot be checked`,
    });
  }
  return Effect.void;
};

export class SourceCatalogService extends Context.Service<
  SourceCatalogService,
  SourceCatalog
>()("SourceCatalogService") {}

export const SourceCatalogLayer = Layer.effect(
  SourceCatalogService,
  Effect.gen(function* () {
    const queue = yield* WorkQueueService;
    const store = yield* CandidateStoreService;
    const promoter = yield* PromoterService;
    return {
      claimWork: (agent) => queue.claim(agent),
      enrichCandidate: (id, patch) =>
        decodeId(id).pipe(
          Effect.flatMap((parsedId) =>
            decodePatch(patch).pipe(
              Effect.flatMap((parsed) => store.enrich(parsedId, parsed))
            )
          )
        ),
      listCandidates: (filter) =>
        decodeFilter(filter).pipe(
          Effect.flatMap((parsed) => store.list(parsed))
        ),
      promoteSource: (id, spec, observation) =>
        decodeId(id).pipe(
          Effect.flatMap((parsedId) =>
            Effect.gen(function* () {
              const candidate = yield* store
                .get(parsedId)
                .pipe(Effect.map(Option.getOrThrow));
              if (candidate.status === "promoted") {
                return yield* Effect.fail(
                  AlreadyPromoted.make({
                    message: `candidate ${parsedId} already promoted`,
                  })
                );
              }
              const verified = yield* decodeObservation(observation);
              yield* requireVerified(candidate.domain, verified);
              // Carry the candidate's classification into the promoted spec
              // unless the author set one. Losing it here is what left the
              // catalog unable to say which sources a deployment can run.
              const withAccess =
                typeof spec === "object" && spec !== null
                  ? {
                      ...(candidate.access === undefined
                        ? {}
                        : { access: candidate.access }),
                      ...(spec as Record<string, unknown>),
                    }
                  : spec;
              // The spec carries the artifacts its classification came from, so
              // a shipped pack file says which of its sources were checked.
              const evidenced = {
                ...(withAccess as Record<string, unknown>),
                access: verified.observed,
                accessEvidence: verified.evidence,
              };
              yield* promoter.writeSource(
                candidate.category,
                candidate.domain,
                evidenced
              );
              return yield* store.markPromoted(parsedId, evidenced);
            })
          )
        ),
      seed: () => queue.seed(discoveryUnits),
      submitCandidate: (input) =>
        decodeInput(input).pipe(
          Effect.flatMap((parsed) => store.submit(parsed))
        ),
      supersede: (oldId, replacementId) =>
        decodeId(oldId).pipe(
          Effect.flatMap((parsedOld) =>
            decodeId(replacementId).pipe(
              Effect.flatMap((parsedReplacement) =>
                store.supersede(parsedOld, parsedReplacement)
              )
            )
          )
        ),
    };
  })
);
