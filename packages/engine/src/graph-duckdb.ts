import { DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";
import {
  DuckDBConfig,
  Entity,
  Event,
  type ExtentHit,
  GraphState,
  type GraphStore,
  ProvenanceError,
  Relation,
  Step,
} from "@viokit/schema";
import { Context, Effect, Layer, Option, Schema } from "effect";

/**
 * DuckDB-backed graph store (TDR-005). The step log is the system of record
 * (append-only, I3); the materialized projection is a set of columnar tables
 * (entities/relations/events) rebuilt by `replay`. Queries run SQL over the
 * projection — recursive CTEs for paths/relatedness, indexed scans for
 * timeline/spatial. Replay reproduces state deterministically (I3/I11); every
 * insert requires a step referencing at least one evidence id (I2).
 */
const logTable = "step_log";
const entityTable = "entities";
const relationTable = "relations";
const eventTable = "events";

const encodeStep = Schema.encodeUnknownSync(Step);
const encodeEntity = Schema.encodeUnknownSync(Entity);
const encodeRelation = Schema.encodeUnknownSync(Relation);
const encodeEvent = Schema.encodeUnknownSync(Event);
const decodeStep = Schema.decodeUnknownSync(Step);
const decodeEntity = Schema.decodeUnknownSync(Entity);
const decodeRelation = Schema.decodeUnknownSync(Relation);
const decodeEvent = Schema.decodeUnknownSync(Event);

const asMs = (date: Date): number => date.getTime();

const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

/** Revive the ISO date strings that `Schema.encodeUnknownSync` emits into Date. */
const revive = (_key: string, value: unknown): unknown => {
  if (typeof value === "string" && isoDatePattern.test(value)) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return date;
    }
  }
  return value;
};

const parseJson = (value: unknown): unknown =>
  typeof value === "string" ? JSON.parse(value, revive) : value;

const readStepsSql = `SELECT data FROM ${logTable} ORDER BY seq`;

interface Row {
  data?: string;
  distance?: unknown;
  entity_id?: string;
  id?: string;
  kind?: string;
  lat?: unknown;
  lon?: unknown;
  path_entities?: string[];
  path_rels?: string[];
  relation_type?: string | null;
  valid_from?: unknown;
  valid_to?: unknown;
}

const toExtentHit = (row: Row): ExtentHit => ({
  id: row.id as string,
  kind: row.kind as string,
  lat: row.lat as number | null,
  lon: row.lon as number | null,
  validFrom: new Date(Number(row.valid_from)),
  validTo: new Date(Number(row.valid_to)),
});

export class DuckDBGraphService extends Context.Service<
  DuckDBGraphService,
  GraphStore
>()("DuckDBGraphService", {
  make: Effect.gen(function* () {
    const path = Option.getOrElse(
      yield* Effect.serviceOption(DuckDBConfig),
      () => ""
    );

    const graphStore = yield* Effect.tryPromise(async () => {
      const instance = await DuckDBInstance.create(
        path === "" ? undefined : path
      );
      const connection = await instance.connect();

      await connection.run(`
      CREATE TABLE IF NOT EXISTS ${logTable} (
        seq BIGINT,
        data JSON
      );
      CREATE TABLE IF NOT EXISTS ${entityTable} (
        id VARCHAR,
        kind VARCHAR,
        lat DOUBLE,
        lon DOUBLE,
        valid_from BIGINT,
        valid_to BIGINT,
        data JSON
      );
      CREATE TABLE IF NOT EXISTS ${relationTable} (
        id VARCHAR,
        source_id VARCHAR,
        target_id VARCHAR,
        type VARCHAR,
        valid_from BIGINT,
        valid_to BIGINT,
        data JSON
      );
      CREATE TABLE IF NOT EXISTS ${eventTable} (
        id VARCHAR,
        kind VARCHAR,
        lat DOUBLE,
        lon DOUBLE,
        valid_from BIGINT,
        valid_to BIGINT,
        data JSON
      );
    `);

      const clearProjection = (): Promise<unknown> =>
        Promise.all([
          connection.run(`DELETE FROM ${entityTable}`),
          connection.run(`DELETE FROM ${relationTable}`),
          connection.run(`DELETE FROM ${eventTable}`),
        ]);

      /** Rebuild the materialized projection from the step log (I3/I11). */
      const replay = async (): Promise<GraphState> => {
        await clearProjection();

        const reader = await connection.runAndReadAll(readStepsSql);
        reader.readAll();
        const steps = reader
          .getRowObjectsJS()
          .map((row: Row) => decodeStep(parseJson(row.data)));

        const entities = new Map<string, Entity>();
        const relations = new Map<string, Relation>();
        const events = new Map<string, Event>();
        for (const step of steps) {
          if (step.operation._tag === "AddEntity") {
            const { entity } = step.operation;
            entities.set(entity.id, entity);
          } else if (step.operation._tag === "AddRelation") {
            const { relation } = step.operation;
            relations.set(relation.id, relation);
          } else if (step.operation._tag === "AddEvent") {
            const { event } = step.operation;
            events.set(event.id, event);
          }
          // ResolveEntity is a merge step: it does not create or modify any
          // vertex and is intentionally a no-op in the replay projection.
        }

        const entityRows = Array.from(entities.values()).map((entity) => [
          entity.id,
          entity.kind,
          entity.spatialExtent.lat,
          entity.spatialExtent.lon,
          asMs(entity.temporalExtent.validFrom),
          asMs(entity.temporalExtent.validTo),
          JSON.stringify(encodeEntity(entity)),
        ]);
        const relationRows = Array.from(relations.values()).map((relation) => [
          relation.id,
          relation.sourceId,
          relation.targetId,
          relation.type,
          asMs(relation.temporalExtent.validFrom),
          asMs(relation.temporalExtent.validTo),
          JSON.stringify(encodeRelation(relation)),
        ]);
        const eventRows = Array.from(events.values()).map((event) => [
          event.id,
          event.kind,
          event.spatialExtent.lat,
          event.spatialExtent.lon,
          asMs(event.temporalExtent.validFrom),
          asMs(event.temporalExtent.validTo),
          JSON.stringify(encodeEvent(event)),
        ]);

        const insertRows = (
          table: string,
          rows: readonly (readonly unknown[])[]
        ): Promise<unknown> => {
          if (rows.length === 0) {
            return Promise.resolve();
          }
          const placeholders = rows
            .map(() => "(?, ?, ?, ?, ?, ?, ?)")
            .join(", ");
          const values = rows.flat();
          return connection.run(
            `INSERT INTO ${table} VALUES ${placeholders}`,
            values as DuckDBValue[]
          );
        };

        await Promise.all([
          insertRows(entityTable, entityRows),
          insertRows(relationTable, relationRows),
          insertRows(eventTable, eventRows),
        ]);

        return readState();
      };

      const readState = async (): Promise<GraphState> => {
        const [eReader, rReader, evReader] = await Promise.all([
          connection.runAndReadAll(`SELECT data FROM ${entityTable}`),
          connection.runAndReadAll(`SELECT data FROM ${relationTable}`),
          connection.runAndReadAll(`SELECT data FROM ${eventTable}`),
        ]);
        await Promise.all([
          eReader.readAll(),
          rReader.readAll(),
          evReader.readAll(),
        ]);
        const entities = eReader
          .getRowObjectsJS()
          .map((row: Row) => decodeEntity(parseJson(row.data)));
        const relations = rReader
          .getRowObjectsJS()
          .map((row: Row) => decodeRelation(parseJson(row.data)));
        const events = evReader
          .getRowObjectsJS()
          .map((row: Row) => decodeEvent(parseJson(row.data)));
        return GraphState.make({ entities, events, relations });
      };

      const store: GraphStore = {
        dispose: Effect.try(() => {
          instance.closeSync();
        }),
        insert: (step) =>
          Effect.gen(function* () {
            if (step.evidenceIds.length === 0) {
              return yield* ProvenanceError.make({
                message: "step must reference at least one evidence id",
              });
            }
            const result = yield* Effect.tryPromise(async () => {
              const countReader = await connection.runAndReadAll(
                `SELECT COALESCE(MAX(seq), 0) AS seq FROM ${logTable}`
              );
              countReader.readAll();
              const nextSeq =
                Number(
                  (countReader.getRowObjects()[0] as { seq: unknown }).seq
                ) + 1;
              await connection.run(`INSERT INTO ${logTable} VALUES (?, ?)`, [
                nextSeq,
                JSON.stringify(encodeStep(step)),
              ]);
              return step;
            }).pipe(
              Effect.mapError((error) =>
                ProvenanceError.make({
                  message: `failed to append step to log: ${String(error)}`,
                })
              )
            );
            return result;
          }),
        log: Effect.tryPromise(async () => {
          const reader = await connection.runAndReadAll(readStepsSql);
          reader.readAll();
          return reader
            .getRowObjectsJS()
            .map((row: Row) => decodeStep(parseJson(row.data)));
        }),
        paths: (from, to, maxDepth = 4) =>
          Effect.tryPromise(async () => {
            const reader = await connection.runAndReadAll(
              `
            WITH RECURSIVE search(
              entity_id, depth, path_entities, path_rels, reached
            ) AS (
              SELECT target_id, 1,
                     [source_id, target_id], [id],
                     [source_id, target_id]
              FROM ${relationTable}
              WHERE source_id = ?
              UNION ALL
              SELECT r.target_id, s.depth + 1,
                     list_append(s.path_entities, r.target_id),
                     list_append(s.path_rels, r.id),
                     list_append(s.reached, r.target_id)
              FROM ${relationTable} r
              JOIN search s ON r.source_id = s.entity_id
              WHERE s.depth < ? AND NOT list_contains(s.reached, r.target_id)
            )
            SELECT path_entities, path_rels
            FROM search
            WHERE entity_id = ?
            `,
              [from, maxDepth, to]
            );
            reader.readAll();
            return (reader.getRowObjectsJS() as Row[]).map((row) => ({
              entityIds: row.path_entities as string[],
              relationIds: row.path_rels as string[],
            }));
          }),
        queryEntity: (id) =>
          Effect.tryPromise(async () => {
            const reader = await connection.runAndReadAll(
              `SELECT data FROM ${entityTable} WHERE id = ?`,
              [id]
            );
            reader.readAll();
            const rows = reader.getRowObjectsJS() as Row[];
            const [first] = rows;
            return first === undefined
              ? Option.none()
              : Option.some(decodeEntity(parseJson(first.data)));
          }),
        relatedness: (seed, maxDepth = 3) =>
          Effect.tryPromise(async () => {
            const reader = await connection.runAndReadAll(
              `
            WITH RECURSIVE bfs(
              entity_id, depth, relation_type, reached
            ) AS (
              SELECT target_id, 1, type, [source_id, target_id]
              FROM ${relationTable}
              WHERE source_id = ?
              UNION ALL
              SELECT r.target_id, b.depth + 1, r.type,
                     list_append(b.reached, r.target_id)
              FROM ${relationTable} r
              JOIN bfs b ON r.source_id = b.entity_id
              WHERE b.depth < ? AND NOT list_contains(b.reached, r.target_id)
            )
            SELECT entity_id, arg_min(depth, relation_type) AS distance,
                   arg_min(relation_type, depth) AS relation_type
            FROM bfs
            GROUP BY entity_id
            ORDER BY distance
            `,
              [seed, maxDepth]
            );
            reader.readAll();
            return (reader.getRowObjectsJS() as Row[]).map((row) => ({
              distance: Number(row.distance),
              entityId: row.entity_id as string,
              relationType: row.relation_type as string | null,
            }));
          }),
        replay: Effect.tryPromise(() => replay()),
        spatial: (bbox) =>
          Effect.tryPromise(async () => {
            const [e, ev] = await Promise.all([
              connection.runAndReadAll(
                `SELECT id, kind, valid_from, valid_to, lat, lon
               FROM ${entityTable}
               WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`,
                [bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon]
              ),
              connection.runAndReadAll(
                `SELECT id, kind, valid_from, valid_to, lat, lon
               FROM ${eventTable}
               WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`,
                [bbox.minLat, bbox.maxLat, bbox.minLon, bbox.maxLon]
              ),
            ]);
            await Promise.all([e.readAll(), ev.readAll()]);
            return [
              ...(e.getRowObjectsJS() as Row[]).map(toExtentHit),
              ...(ev.getRowObjectsJS() as Row[]).map(toExtentHit),
            ];
          }),
        timeline: (from, to) =>
          Effect.tryPromise(async () => {
            const [e, ev] = await Promise.all([
              connection.runAndReadAll(
                `SELECT id, kind, valid_from, valid_to, lat, lon
               FROM ${entityTable}
               WHERE valid_from <= ? AND valid_to >= ?`,
                [asMs(to), asMs(from)]
              ),
              connection.runAndReadAll(
                `SELECT id, kind, valid_from, valid_to, lat, lon
               FROM ${eventTable}
               WHERE valid_from <= ? AND valid_to >= ?`,
                [asMs(to), asMs(from)]
              ),
            ]);
            await Promise.all([e.readAll(), ev.readAll()]);
            return [
              ...(e.getRowObjectsJS() as Row[]).map(toExtentHit),
              ...(ev.getRowObjectsJS() as Row[]).map(toExtentHit),
            ];
          }),
      };

      // Rebuild the materialized projection from the persisted step log when
      // reopening a durable path, so queries reflect prior writes (I3/I11).
      if (path !== "") {
        await replay();
      }

      return store;
    });
    return graphStore;
  }),
}) {}

export const DuckDBGraphLayer = Layer.effect(
  DuckDBGraphService,
  DuckDBGraphService.make
);
