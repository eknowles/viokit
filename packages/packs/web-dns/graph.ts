import {
  AddEntity,
  AddRelation,
  Entity,
  entityId,
  Identifier,
  Relation,
  relationId,
  SpatialExtent,
  TemporalExtent,
} from "@viokit/schema";

/**
 * Helpers the web-dns projections share. Names of entity kinds and relation
 * types come from @viokit/vocabulary; `bun run conformance` fails any that do
 * not.
 */

export const unbounded = TemporalExtent.make({
  validFrom: new Date(0),
  validTo: new Date("9999-12-31T00:00:00.000Z"),
});

export const unlocated = SpatialExtent.make({ lat: 0, lon: 0 });

export const domainEntity = (name: string) =>
  AddEntity.make({
    entity: Entity.make({
      id: entityId(name),
      identifiers: [Identifier.make({ kind: "domain", value: name })],
      kind: "domain",
      spatialExtent: unlocated,
      temporalExtent: unbounded,
    }),
  });

export const linked = (from: string, to: string, type: string) =>
  AddRelation.make({
    relation: Relation.make({
      id: relationId(`${from}->${to}:${type}`),
      sourceId: entityId(from),
      targetId: entityId(to),
      temporalExtent: unbounded,
      type,
    }),
  });

/**
 * An entity of a kind that has no natural global id. The id is prefixed with
 * the kind so an organization named like a domain cannot collide with it.
 * Domains and IP addresses keep their plain value as the id, so entities from
 * different tools meet on the same node.
 */
export const keyOf = (kind: string, value: string): string =>
  `${kind}:${value}`;

export const entityOfKind = (kind: string, key: string, value: string) =>
  AddEntity.make({
    entity: Entity.make({
      id: entityId(key),
      identifiers: [Identifier.make({ kind, value })],
      kind,
      spatialExtent: unlocated,
      temporalExtent: unbounded,
    }),
  });

export const ipEntity = (address: string, identifierKind: string) =>
  AddEntity.make({
    entity: Entity.make({
      id: entityId(address),
      identifiers: [Identifier.make({ kind: identifierKind, value: address })],
      kind: "ip-address",
      spatialExtent: unlocated,
      temporalExtent: unbounded,
    }),
  });
