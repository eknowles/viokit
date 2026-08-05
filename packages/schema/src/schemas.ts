import { Schema } from "effect";

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

export const AcquisitionPath = Schema.Union([Live, Cache, AcqProxy]);
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

export const StepOperation = Schema.Union([AddEntity, AddRelation, AddEvent]);
export type StepOperation = typeof StepOperation.Type;

export class Step extends Schema.Class<Step>("Step")({
  evidenceIds: NonEmptyEvidenceIds,
  id: StepId,
  operation: StepOperation,
}) {}

export class SourceSpec extends Schema.Class<SourceSpec>("SourceSpec")({
  id: Schema.String,
  transport: Schema.String,
  url: Schema.String,
}) {}

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
