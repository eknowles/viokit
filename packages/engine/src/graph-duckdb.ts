import { randomUUID } from "node:crypto";
import { DuckDBInstance, type DuckDBValue } from "@duckdb/node-api";
import {
  DuckDBConfig,
  Entity,
  Event,
  type ExtentHit,
  GraphState,
  type GraphStore,
  type Investigation,
  type InvestigationId,
  investigationId,
  LEGACY_INVESTIGATION_NAME,
  ProvenanceError,
  Relation,
  reviveDates,
  SharedArtifact,
  Step,
  UnknownInvestigation,
} from "@viokit/schema";
import { Context, Effect, Layer, Option, Schema, Semaphore } from "effect";

/**
 * DuckDB-backed graph store (TDR-005). The step log is the system of record
 * (append-only, I3); the materialized projection is a set of columnar tables
 * (entities/relations/events) rebuilt by `replay`. Queries run SQL over the
 * projection — recursive CTEs for paths/relatedness, indexed scans for
 * timeline/spatial. Replay reproduces state deterministically (I3/I11); every
 * insert requires a step referencing at least one evidence id (I2).
 */
const logTable = "step_log";
const investigationTable = "investigations";
const stateTable = "store_state";
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

/** DuckDB returns the JSON column as a string; dates arrive as ISO strings. */
const parseJson = (value: unknown): unknown =>
  typeof value === "string" ? JSON.parse(value, reviveDates) : value;

/**
 * The only two places that read the log are this scoped read and the append
 * below. Every query reads the *projection* that `replay` rebuilds, so scoping
 * replay scopes everything downstream by construction — which is what made
 * TDR-025 choose a shared log over a file per case.
 */
const scopedStepsSql = (clause: string) =>
  `SELECT data FROM ${logTable} WHERE ${clause} ORDER BY seq`;

interface Row {
  created_at?: unknown;
  data?: string;
  distance?: unknown;
  entity_id?: string;
  evidence_id?: string;
  forked_at?: unknown;
  id?: string;
  investigation_ids?: unknown;
  kind?: string;
  lat?: unknown;
  lon?: unknown;
  name?: string;
  parent?: unknown;
  path_entities?: string[];
  path_rels?: string[];
  relation_type?: string | null;
  status?: string;
  valid_from?: unknown;
  valid_to?: unknown;
  value?: string;
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
        investigation_id VARCHAR,
        data JSON
      );
      CREATE TABLE IF NOT EXISTS ${stateTable} (
        key VARCHAR,
        value VARCHAR
      );
      CREATE TABLE IF NOT EXISTS ${investigationTable} (
        id VARCHAR,
        name VARCHAR,
        created_at BIGINT,
        parent VARCHAR,
        forked_at BIGINT,
        status VARCHAR
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

      // --- investigations (TDR-025) ---------------------------------------
      //
      // Held in memory as well as on disk because the ancestry clause is built
      // per replay and walking it in SQL each time would buy nothing.
      const investigations = new Map<string, Investigation>();

      const loadInvestigations = async (): Promise<void> => {
        const reader = await connection.runAndReadAll(
          `SELECT id, name, created_at, parent, forked_at, status FROM ${investigationTable}`
        );
        reader.readAll();
        investigations.clear();
        for (const row of reader.getRowObjectsJS() as Row[]) {
          const parent = row.parent as string | null;
          const forkedAt = row.forked_at as number | bigint | null;
          investigations.set(
            row.id as string,
            {
              createdAt: new Date(Number(row.created_at)),
              ...(forkedAt === null ? {} : { forkedAt: Number(forkedAt) }),
              id: investigationId(row.id as string),
              name: row.name as string,
              ...(parent === null ? {} : { parent: investigationId(parent) }),
              status: row.status as Investigation["status"],
            } as Investigation
          );
        }
      };

      const writeInvestigation = async (
        investigation: Investigation
      ): Promise<void> => {
        await connection.run(
          `INSERT INTO ${investigationTable} VALUES (?, ?, ?, ?, ?, ?)`,
          [
            investigation.id,
            investigation.name,
            investigation.createdAt.getTime(),
            investigation.parent ?? null,
            investigation.forkedAt ?? null,
            investigation.status,
          ]
        );
        investigations.set(investigation.id, investigation);
      };

      const newInvestigation = (
        name: string,
        from?: { readonly parent: InvestigationId; readonly forkedAt: number }
      ): Investigation =>
        ({
          createdAt: new Date(),
          ...(from === undefined ? {} : { forkedAt: from.forkedAt }),
          // A case can be handed between machines, so its identity must not be
          // something two machines could both produce (TDR-025 open question).
          id: investigationId(randomUUID()),
          name,
          ...(from === undefined ? {} : { parent: from.parent }),
          status: "open",
        }) as Investigation;

      const maxSeq = async (): Promise<number> => {
        const reader = await connection.runAndReadAll(
          `SELECT COALESCE(MAX(seq), 0) AS seq FROM ${logTable}`
        );
        reader.readAll();
        return Number((reader.getRowObjects()[0] as { seq: unknown }).seq);
      };

      /**
       * The steps an investigation can see: its own, plus each ancestor's up to
       * the point the fork happened. The bound tightens as it walks up, since a
       * grandparent is only visible as far as the parent's own fork.
       */
      /** The investigation and each ancestor, with how far into it is visible. */
      const ancestry = (
        id: string
      ): ReadonlyArray<{ readonly id: string; readonly upTo?: number }> => {
        const windows: Array<{ readonly id: string; readonly upTo?: number }> =
          [];
        let cursor: string | undefined = id;
        let bound: number | undefined;
        while (cursor !== undefined) {
          const investigation = investigations.get(cursor);
          if (investigation === undefined) {
            break;
          }
          windows.push(
            bound === undefined ? { id: cursor } : { id: cursor, upTo: bound }
          );
          const { forkedAt } = investigation;
          if (investigation.parent === undefined || forkedAt === undefined) {
            break;
          }
          bound = bound === undefined ? forkedAt : Math.min(bound, forkedAt);
          cursor = investigation.parent;
        }
        return windows;
      };

      const scopeOf = (
        id: string
      ): { readonly clause: string; readonly params: DuckDBValue[] } => {
        const params: DuckDBValue[] = [];
        const clauses = ancestry(id).map((window) => {
          params.push(window.id);
          if (window.upTo === undefined) {
            return "investigation_id = ?";
          }
          params.push(window.upTo);
          return "(investigation_id = ? AND seq <= ?)";
        });
        return {
          clause: clauses.length === 0 ? "FALSE" : clauses.join(" OR "),
          params,
        };
      };

      let currentId = "";

      /**
       * Which investigation is open, persisted.
       *
       * Found by using it: without this the CLI opened a case in one process
       * and recorded into another in the next, because "current" only lived in
       * memory. Work landing in the wrong case is exactly the silent failure
       * this feature exists to prevent.
       */
      const OPEN_KEY = "open_investigation";

      const rememberOpen = async (id: string): Promise<void> => {
        await connection.run(`DELETE FROM ${stateTable} WHERE key = ?`, [
          OPEN_KEY,
        ]);
        await connection.run(`INSERT INTO ${stateTable} VALUES (?, ?)`, [
          OPEN_KEY,
          id,
        ]);
      };

      const rememberedOpen = async (): Promise<string | undefined> => {
        const reader = await connection.runAndReadAll(
          `SELECT value FROM ${stateTable} WHERE key = ?`,
          [OPEN_KEY]
        );
        reader.readAll();
        const rows = reader.getRowObjectsJS() as Row[];
        return rows.length === 0 ? undefined : (rows[0]?.value as string);
      };

      /**
       * Adopt a log that predates investigations. The steps are unchanged —
       * what is recorded is which case they were always in, named for what it
       * is rather than silently attributed to one somebody chose.
       */
      const adoptOrStart = async (): Promise<void> => {
        await loadInvestigations();
        if (investigations.size > 0) {
          const remembered = await rememberedOpen();
          currentId =
            remembered !== undefined && investigations.has(remembered)
              ? remembered
              : ([...investigations.values()].sort(
                  (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
                )[0]?.id as string);
          return;
        }
        const orphans = await maxSeq();
        const investigation = newInvestigation(
          orphans > 0 ? LEGACY_INVESTIGATION_NAME : "default"
        );
        await writeInvestigation(investigation);
        await rememberOpen(investigation.id);
        if (orphans > 0) {
          await connection.run(
            `UPDATE ${logTable} SET investigation_id = ? WHERE investigation_id IS NULL`,
            [investigation.id]
          );
        }
        currentId = investigation.id;
      };

      await adoptOrStart();

      const clearProjection = (): Promise<unknown> =>
        Promise.all([
          connection.run(`DELETE FROM ${entityTable}`),
          connection.run(`DELETE FROM ${relationTable}`),
          connection.run(`DELETE FROM ${eventTable}`),
        ]);

      /** Rebuild the materialized projection from the step log (I3/I11). */
      /** One permit: the materialized projection has a single writer. */
      const projectionLock = Semaphore.makeUnsafe(1);

      const replay = async (): Promise<GraphState> => {
        await clearProjection();

        const scope = scopeOf(currentId);
        const reader = await connection.runAndReadAll(
          scopedStepsSql(scope.clause),
          scope.params
        );
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

      const known = (
        id: InvestigationId
      ): Effect.Effect<Investigation, UnknownInvestigation> => {
        const found = investigations.get(id);
        return found === undefined
          ? UnknownInvestigation.make({
              message: `no investigation with id '${id}'`,
            })
          : Effect.succeed(found);
      };

      const store: GraphStore = {
        createInvestigation: (name) =>
          Effect.promise(async () => {
            const investigation = newInvestigation(name);
            await writeInvestigation(investigation);
            return investigation;
          }),
        current: Effect.sync(
          () => investigations.get(currentId) as Investigation
        ),
        discardInvestigation: (id) =>
          Effect.gen(function* () {
            const investigation = yield* known(id);
            if (id === currentId) {
              // Nothing would be left to answer for.
              return yield* UnknownInvestigation.make({
                message: `investigation '${investigation.name}' is open; open another before discarding it`,
              });
            }
            yield* Effect.promise(async () => {
              await connection.run(
                `UPDATE ${investigationTable} SET status = 'discarded' WHERE id = ?`,
                [id]
              );
              // Append-only: the steps stay, the case stops contributing (I3).
              investigations.set(id, { ...investigation, status: "discarded" });
            });
          }),
        dispose: Effect.try(() => {
          instance.closeSync();
        }),
        forkInvestigation: (from, name) =>
          Effect.gen(function* () {
            yield* known(from);
            return yield* Effect.promise(async () => {
              const investigation = newInvestigation(name, {
                forkedAt: await maxSeq(),
                parent: from,
              });
              await writeInvestigation(investigation);
              return investigation;
            });
          }),
        insert: (step) =>
          Effect.gen(function* () {
            if (step.evidenceIds.length === 0) {
              return yield* ProvenanceError.make({
                message: "step must reference at least one evidence id",
              });
            }
            const result = yield* Effect.tryPromise(async () => {
              // `seq` stays global so ordering is consistent across cases; the
              // investigation column is what scopes the read.
              const nextSeq = (await maxSeq()) + 1;
              await connection.run(`INSERT INTO ${logTable} VALUES (?, ?, ?)`, [
                nextSeq,
                currentId,
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
        investigations: Effect.sync(() => [...investigations.values()]),
        log: Effect.tryPromise(async () => {
          const scope = scopeOf(currentId);
          const reader = await connection.runAndReadAll(
            scopedStepsSql(scope.clause),
            scope.params
          );
          reader.readAll();
          return reader
            .getRowObjectsJS()
            .map((row: Row) => decodeStep(parseJson(row.data)));
        }),
        openInvestigation: (id) =>
          Effect.gen(function* () {
            const investigation = yield* known(id);
            currentId = id;
            yield* Effect.promise(() => rememberOpen(id));
            // The projection holds one investigation at a time, so switching
            // rebuilds it — the cost TDR-025 took in exchange for scope living
            // in one place.
            yield* Effect.promise(() =>
              projectionLock
                .withPermits(1)(Effect.promise(replay))
                .pipe(Effect.runPromise)
            );
            return investigation;
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
        // Serialized: `replay` clears the projection and rebuilds it, so two
        // concurrent calls both clear, then both insert, and each returns a
        // doubled graph. Found from a browser, where React's StrictMode
        // double-invokes effects — a duplicated replay is an I3 violation, not
        // a display glitch.
        replay: projectionLock.withPermits(1)(
          Effect.tryPromise(() => replay())
        ),
        sharedEvidence: Effect.tryPromise(async () => {
          // The one query that crosses cases, and the only one that reads the
          // log unscoped. Named so it cannot be reached by accident.
          const reader = await connection.runAndReadAll(`
            SELECT evidence_id, list(DISTINCT investigation_id) AS investigation_ids
            FROM (
              SELECT investigation_id,
                     unnest(json_extract_string(data, '$.evidenceIds')::VARCHAR[]) AS evidence_id
              FROM ${logTable}
            )
            GROUP BY evidence_id
            HAVING count(DISTINCT investigation_id) > 1
            ORDER BY evidence_id
          `);
          reader.readAll();
          return (reader.getRowObjectsJS() as Row[]).map((row) =>
            SharedArtifact.make({
              evidenceId: row.evidence_id as string,
              investigationIds: (row.investigation_ids as string[]).map(
                investigationId
              ),
            })
          );
        }).pipe(Effect.orDie),
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
