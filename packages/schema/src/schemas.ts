import { Effect, Schema } from "effect";

/** A transport selector — how a source reaches the outside world. */
export const Transport = Schema.Literals(["http", "dataset"]);
export type Transport = typeof Transport.Type;

/** Authentication for a source. Credentials never enter the cache or evidence. */
export class SourceAuth extends Schema.Class<SourceAuth>("SourceAuth")({
  apiKey: Schema.optionalKey(Schema.String),
  token: Schema.optionalKey(Schema.String),
}) {}

export class RetryPolicy extends Schema.Class<RetryPolicy>("RetryPolicy")({
  baseDelayMs: Schema.Number,
  factor: Schema.Finite,
  maxAttempts: Schema.Int,
}) {}

export class RateLimitPolicy extends Schema.Class<RateLimitPolicy>(
  "RateLimitPolicy"
)({
  capacity: Schema.Int,
  refillPerSecond: Schema.Finite,
}) {}

export const CacheMode = Schema.Literals([
  "live-only",
  "cache-first",
  "cache-only",
  "refresh",
]);
export type CacheMode = typeof CacheMode.Type;

export class CachePolicy extends Schema.Class<CachePolicy>("CachePolicy")({
  maxStaleMs: Schema.Number,
  mode: CacheMode,
  ttlMs: Schema.Number,
}) {}

export class EgressDirect extends Schema.TaggedClass<EgressDirect>()(
  "direct",
  {}
) {}

export class EgressProxy extends Schema.TaggedClass<EgressProxy>()("proxy", {
  proxyId: Schema.String,
}) {}

export class EgressOff extends Schema.TaggedClass<EgressOff>()(
  "disabled",
  {}
) {}

export const EgressPolicy = Schema.Union([
  EgressDirect,
  EgressProxy,
  EgressOff,
]);
export type EgressPolicy = typeof EgressPolicy.Type;

export const ResponseProjection = Schema.Literals(["bytes", "rows"]);
export type ResponseProjection = typeof ResponseProjection.Type;

const withDefault = <S extends Schema.Constraint>(
  schema: S,
  value: S["Type"]
): Schema.optional<S> => {
  const defaultValue = Effect.succeed(value as never);
  const withConstructor = Schema.withConstructorDefault(defaultValue) as (
    self: unknown
  ) => unknown;
  const withDecoding = Schema.withDecodingDefaultKey(defaultValue as never) as (
    self: unknown
  ) => unknown;
  // biome-ignore lint/suspicious/noExplicitAny: casting through the pipeable protocol
  const optional = (schema as any).pipe(Schema.optionalKey);
  return withDecoding(
    withConstructor(optional)
  ) as unknown as Schema.optional<S>;
};

export const IdentifierId = Schema.String.pipe(Schema.brand("IdentifierId"));
export type IdentifierId = typeof IdentifierId.Type;

export const EntityId = Schema.String.pipe(Schema.brand("EntityId"));
export type EntityId = typeof EntityId.Type;

export const RelationId = Schema.String.pipe(Schema.brand("RelationId"));
export type RelationId = typeof RelationId.Type;

export const EventId = Schema.String.pipe(Schema.brand("EventId"));
export type EventId = typeof EventId.Type;

export const EvidenceId = Schema.String.pipe(Schema.brand("EvidenceId"));
export type EvidenceId = typeof EvidenceId.Type;

export const StepId = Schema.String.pipe(Schema.brand("StepId"));
export type StepId = typeof StepId.Type;

export const identifierId = (value: string): IdentifierId =>
  Schema.decodeUnknownSync(IdentifierId)(value);
export const entityId = (value: string): EntityId =>
  Schema.decodeUnknownSync(EntityId)(value);
export const relationId = (value: string): RelationId =>
  Schema.decodeUnknownSync(RelationId)(value);
export const eventId = (value: string): EventId =>
  Schema.decodeUnknownSync(EventId)(value);
export const evidenceId = (value: string): EvidenceId =>
  Schema.decodeUnknownSync(EvidenceId)(value);
export const stepId = (value: string): StepId =>
  Schema.decodeUnknownSync(StepId)(value);

export class Identifier extends Schema.Class<Identifier>("Identifier")({
  kind: Schema.String,
  value: Schema.String,
}) {}

/**
 * A temporal extent. Cross-field validated so that `validFrom <= validTo`.
 * Modelled as a filtered struct (rather than a `Class`) because the validity
 * rule spans two fields; the filtered schema self-rejects invalid ranges at
 * decode time, which is what the boundary relies on (I5).
 */
export const TemporalExtent = Schema.Struct({
  validFrom: Schema.Date,
  validTo: Schema.Date,
}).check(
  Schema.makeFilter<{ readonly validFrom: Date; readonly validTo: Date }>(
    (extent) => extent.validFrom.getTime() <= extent.validTo.getTime(),
    { message: "validFrom must be less than or equal to validTo" }
  )
);
export type TemporalExtent = typeof TemporalExtent.Type;

export class SpatialExtent extends Schema.Class<SpatialExtent>("SpatialExtent")(
  {
    lat: Schema.Finite,
    lon: Schema.Finite,
  }
) {}

export class Entity extends Schema.Class<Entity>("Entity")({
  id: EntityId,
  identifiers: Schema.Array(Identifier),
  kind: Schema.String,
  spatialExtent: SpatialExtent,
  temporalExtent: TemporalExtent,
}) {}

export class Relation extends Schema.Class<Relation>("Relation")({
  id: RelationId,
  sourceId: EntityId,
  targetId: EntityId,
  temporalExtent: TemporalExtent,
  type: Schema.String,
}) {}

export class Event extends Schema.Class<Event>("Event")({
  entityIds: Schema.Array(EntityId),
  id: EventId,
  kind: Schema.String,
  spatialExtent: SpatialExtent,
  temporalExtent: TemporalExtent,
}) {}

export class Live extends Schema.TaggedClass<Live>()("live", {
  ref: Schema.optionalKey(Schema.String),
}) {}

export class Cache extends Schema.TaggedClass<Cache>()("cache", {
  ref: Schema.optionalKey(Schema.String),
}) {}

export class AcqProxy extends Schema.TaggedClass<AcqProxy>()("proxy", {
  ref: Schema.optionalKey(Schema.String),
}) {}

/**
 * Evidence a person (or an agent driving an interface by hand) retrieved, for
 * sources no transport here can reach. `by` is required: unlike the pipeline
 * paths, where the actor is implicit, a human act has an actor worth naming,
 * and evidence that cannot say who obtained it is weak evidence (I9).
 */
export class Manual extends Schema.TaggedClass<Manual>()("manual", {
  by: Schema.String,
  ref: Schema.optionalKey(Schema.String),
}) {}

export const AcquisitionPath = Schema.Union([Live, Cache, AcqProxy, Manual]);
export type AcquisitionPath = typeof AcquisitionPath.Type;

const evidenceFields = {
  acquiredAt: Schema.Date,
  acquisitionPath: AcquisitionPath,
  bytes: Schema.Uint8Array,
  contentType: Schema.String,
  observedAt: Schema.Date,
};

export class Evidence extends Schema.Class<Evidence>("Evidence")({
  id: EvidenceId,
  ...evidenceFields,
}) {}

export const EvidenceInput = Schema.Struct(evidenceFields);
export type EvidenceInput = typeof EvidenceInput.Type;

export const NonEmptyEvidenceIds = Schema.NonEmptyArray(EvidenceId);
export type NonEmptyEvidenceIds = typeof NonEmptyEvidenceIds.Type;

export class AddEntity extends Schema.TaggedClass<AddEntity>()("AddEntity", {
  entity: Entity,
}) {}

export class AddRelation extends Schema.TaggedClass<AddRelation>()(
  "AddRelation",
  {
    relation: Relation,
  }
) {}

export class AddEvent extends Schema.TaggedClass<AddEvent>()("AddEvent", {
  event: Event,
}) {}

/**
 * A deterministic normalization transform applied to an identifier value before
 * equality checking (TDR-015). Built-ins cover the realistic "close but not
 * exact" variation (case, whitespace, punctuation) without probabilistic fuzzy
 * matching; packs may register extra named rules via the seam.
 */
export const Normalization = Schema.Literals([
  "trim",
  "lower",
  "stripPunctuation",
  "collapseWhitespace",
]);
export type Normalization = typeof Normalization.Type;

/** A per-identifier-kind match rule: normalize then exact-compare by kind. */
export class MatchRule extends Schema.Class<MatchRule>("MatchRule")({
  identifierKind: Schema.String,
  normalizations: Schema.Array(Normalization),
}) {}

/**
 * The evidence basis for a resolution: the identifier kind and its (normalized)
 * value that the two entities share. Auditable in the step log (I2).
 */
export class MatchBasis extends Schema.Class<MatchBasis>("MatchBasis")({
  identifierKind: Schema.String,
  normalizedValue: Schema.String,
}) {}

/**
 * A resolution: the evidence that the entity with `mergeId` is the same
 * real-world entity as `canonicalId`, based on shared normalized identifiers.
 * `confidence` is an explicit, auditable field (P2 keeps it at a strict/1.0
 * baseline; P4 veracity may lower it for fuzzy evidence).
 */
export class ResolveEntity extends Schema.TaggedClass<ResolveEntity>()(
  "ResolveEntity",
  {
    canonicalId: EntityId,
    confidence: Schema.Number,
    matchBasis: Schema.Array(MatchBasis),
    mergeId: EntityId,
  }
) {}

export const StepOperation = Schema.Union([
  AddEntity,
  AddRelation,
  AddEvent,
  ResolveEntity,
]);
export type StepOperation = typeof StepOperation.Type;

export class Step extends Schema.Class<Step>("Step")({
  evidenceIds: NonEmptyEvidenceIds,
  id: StepId,
  operation: StepOperation,
}) {}

/**
 * How a source is reached. Shared with the discovery harness's candidate record
 * (`catalog.ts`): the same fact before and after promotion, so it is defined
 * once rather than as two vocabularies that drift. Distinct from `Transport`,
 * which is the mechanism the runtime uses; `browser_scrape` and `requires_key`
 * describe sources no transport here can reach unaided.
 */
export const SourceAccess = Schema.Literals([
  "open_api",
  "dataset",
  "browser_scrape",
  "requires_key",
  "unknown",
]);
export type SourceAccess = typeof SourceAccess.Type;

export class SourceSpec extends Schema.Class<SourceSpec>("SourceSpec")({
  access: withDefault(SourceAccess, "unknown"),
  auth: Schema.optionalKey(SourceAuth),
  cache: withDefault(
    CachePolicy,
    CachePolicy.make({ maxStaleMs: 0, mode: "live-only", ttlMs: 0 })
  ),
  egress: withDefault(EgressPolicy, EgressDirect.make({})),
  id: Schema.String,
  projection: withDefault(ResponseProjection, "bytes"),
  rateLimit: Schema.optionalKey(RateLimitPolicy),
  retry: Schema.optionalKey(RetryPolicy),
  transport: Transport,
  url: Schema.String,
}) {}

/** A transform archetype — the shape of the derivation a transform performs. */
export const TransformArchetype = Schema.Literals([
  "lookup",
  "search",
  "resolve",
  "geolocate",
  "chronolocate",
  "correlate",
  "monitor",
  "extract",
  "archive",
  "analyze",
]);
export type TransformArchetype = typeof TransformArchetype.Type;

/**
 * The input/output contract of a transform. Input is the `unknown` payload a
 * caller hands the runner; output is `unknown` until projected by the
 * `projection`. Both are decoded at the boundary (I6); domain shapes are
 * contributed by packs, so core keeps them open rather than closed enums.
 */
export class TransformSpec extends Schema.Class<TransformSpec>("TransformSpec")(
  {
    archetype: TransformArchetype,
    id: Schema.String,
    input: Schema.Any,
    output: Schema.Any,
    projection: Schema.Any,
    sourceId: Schema.String,
  }
) {}

export class TransformError extends Schema.TaggedErrorClass<TransformError>()(
  "TransformError",
  {
    message: Schema.String,
  }
) {}

export class GraphState extends Schema.Class<GraphState>("GraphState")({
  entities: Schema.Array(Entity),
  events: Schema.Array(Event),
  relations: Schema.Array(Relation),
}) {}

export class ProvenanceError extends Schema.TaggedErrorClass<ProvenanceError>()(
  "ProvenanceError",
  {
    message: Schema.String,
  }
) {}

export class EvidenceWriteError extends Schema.TaggedErrorClass<EvidenceWriteError>()(
  "EvidenceWriteError",
  {
    message: Schema.String,
  }
) {}

export class EvidenceReadError extends Schema.TaggedErrorClass<EvidenceReadError>()(
  "EvidenceReadError",
  {
    message: Schema.String,
  }
) {}

export class SourceError extends Schema.TaggedErrorClass<SourceError>()(
  "SourceError",
  {
    message: Schema.String,
  }
) {}

export class RetryExhausted extends Schema.TaggedErrorClass<RetryExhausted>()(
  "RetryExhausted",
  {
    message: Schema.String,
  }
) {}

export class RateLimited extends Schema.TaggedErrorClass<RateLimited>()(
  "RateLimited",
  {
    message: Schema.String,
  }
) {}

export class OfflineCacheMiss extends Schema.TaggedErrorClass<OfflineCacheMiss>()(
  "OfflineCacheMiss",
  {
    message: Schema.String,
  }
) {}

export class EgressDisabledError extends Schema.TaggedErrorClass<EgressDisabledError>()(
  "EgressDisabled",
  {
    message: Schema.String,
  }
) {}

/**
 * A source this deployment cannot acquire: it needs a transport that is not
 * provided (browser), or credentials that are not configured. Raised before any
 * transport call, so the caller learns the reason instead of a network failure.
 */
export class SourceNotRunnable extends Schema.TaggedErrorClass<SourceNotRunnable>()(
  "SourceNotRunnable",
  {
    message: Schema.String,
  }
) {}

export class RegistryError extends Schema.TaggedErrorClass<RegistryError>()(
  "RegistryError",
  {
    message: Schema.String,
  }
) {}

/**
 * The primitive ontology types the registry accepts. Domain-specific types are
 * never added here (open-domain rule): packs register conforming definitions at
 * runtime, but core stays primitives-only.
 */
export const OntologyDefinition = Schema.Union([Entity, Relation, Event]);
export type OntologyDefinition = typeof OntologyDefinition.Type;
