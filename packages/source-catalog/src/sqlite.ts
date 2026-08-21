import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { layer as sqliteClientLayer } from "@effect/sql-sqlite-bun/SqliteClient";
import {
  fromRecord,
  layer as sqliteMigratorLayer,
} from "@effect/sql-sqlite-bun/SqliteMigrator";
import {
  AlreadyPromoted,
  CandidateNotFound,
  SourceAccess,
  SourceCandidate,
  SourceCandidateId,
  type SourceCandidateInput,
  SourceCandidateStatus,
  SourceTransportKind,
} from "@viokit/schema";
import { Effect, Layer, Option, Schema } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import { candidateFingerprint } from "./fingerprint.js";
import {
  type CandidateFilter,
  CandidateStoreService,
  WorkQueueService,
  WorkUnit,
} from "./seams.js";

const migrations = fromRecord({
  "1_source_catalog": Effect.gen(function* () {
    const sql = yield* SqlClient;
    yield* sql`
      CREATE TABLE IF NOT EXISTS work_units (
        id TEXT PRIMARY KEY NOT NULL,
        category TEXT NOT NULL,
        archetype TEXT NOT NULL,
        claimed_by TEXT,
        leased_until INTEGER
      )
    `.withoutTransform;
    yield* sql`
      CREATE TABLE IF NOT EXISTS candidates (
        fingerprint TEXT PRIMARY KEY NOT NULL,
        domain TEXT NOT NULL,
        category TEXT NOT NULL,
        url TEXT NOT NULL,
        archetypes TEXT NOT NULL,
        access TEXT,
        transport TEXT,
        description TEXT,
        discovered_by TEXT,
        discovered_at INTEGER,
        origin TEXT,
        status TEXT NOT NULL,
        notes TEXT NOT NULL,
        supersedes TEXT,
        promotion TEXT
      )
    `.withoutTransform;
    yield* sql`
      CREATE INDEX IF NOT EXISTS candidates_status_idx ON candidates (status)
    `.withoutTransform;
    yield* sql`
      CREATE INDEX IF NOT EXISTS candidates_category_idx ON candidates (category)
    `.withoutTransform;
  }),
});

const WorkUnitRow = Schema.Struct({
  archetype: Schema.String,
  category: Schema.String,
  claimed_by: Schema.optionalKey(Schema.NullOr(Schema.String)),
  id: Schema.String,
  leased_until: Schema.optionalKey(Schema.NullOr(Schema.Number)),
});
const decodeWorkUnitRow = Schema.decodeUnknownSync(WorkUnitRow);
type WorkUnitRow = Schema.Schema.Type<typeof WorkUnitRow>;

const CandidateRow = Schema.Struct({
  access: Schema.optionalKey(Schema.NullOr(Schema.String)),
  archetypes: Schema.String,
  category: Schema.String,
  description: Schema.optionalKey(Schema.NullOr(Schema.String)),
  discovered_at: Schema.optionalKey(Schema.NullOr(Schema.NumberFromString)),
  discovered_by: Schema.optionalKey(Schema.NullOr(Schema.String)),
  domain: Schema.String,
  fingerprint: Schema.String,
  notes: Schema.String,
  origin: Schema.optionalKey(Schema.NullOr(Schema.String)),
  status: Schema.String,
  transport: Schema.optionalKey(Schema.NullOr(Schema.String)),
  url: Schema.String,
});
const decodeCandidateRow = Schema.decodeUnknownSync(CandidateRow);
type CandidateRow = Schema.Schema.Type<typeof CandidateRow>;

const decodeStatus = Schema.decodeUnknownSync(SourceCandidateStatus);

const parseStringArray = (value: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
};

const decodeAccess = Schema.decodeUnknownSync(SourceAccess);
const decodeTransport = Schema.decodeUnknownSync(SourceTransportKind);

const mergedFields = (existing: CandidateRow, input: SourceCandidateInput) => {
  const archetypes = [
    ...new Set([...parseStringArray(existing.archetypes), ...input.archetypes]),
  ];
  const notes = [...parseStringArray(existing.notes)];
  if (
    input.discoveredBy !== undefined &&
    existing.discovered_by === undefined
  ) {
    notes.push(`discovered by ${input.discoveredBy}`);
  }
  return {
    archetypes,
    discoveredAt:
      existing.discovered_at ??
      (input.discoveredAt ? input.discoveredAt.getTime() : undefined),
    discoveredBy: existing.discovered_by ?? input.discoveredBy,
    notes,
  };
};

const toSourceCandidate = (row: CandidateRow): SourceCandidate =>
  SourceCandidate.make({
    archetypes: parseStringArray(row.archetypes) as [string, ...string[]],
    category: row.category,
    domain: row.domain,
    id: SourceCandidateId.make(row.fingerprint),
    url: row.url,
    ...(isPresent(row.access) ? { access: decodeAccess(row.access) } : {}),
    ...(isPresent(row.transport)
      ? { transport: decodeTransport(row.transport) }
      : {}),
    ...(isPresent(row.description) ? { description: row.description } : {}),
    ...(isPresent(row.discovered_by)
      ? { discoveredBy: row.discovered_by }
      : {}),
    ...(isPresent(row.discovered_at)
      ? { discoveredAt: new Date(row.discovered_at) }
      : {}),
    ...(isPresent(row.origin) ? { origin: row.origin } : {}),
    notes: [...parseStringArray(row.notes)],
    status: decodeStatus(row.status),
  });

const isPresent = <T>(value: T | null | undefined): value is T =>
  value !== undefined && value !== null;

const toWorkUnit = (row: WorkUnitRow): WorkUnit =>
  WorkUnit.make({
    archetype: row.archetype,
    category: row.category,
    id: row.id,
    ...(isPresent(row.claimed_by) ? { claimedBy: row.claimed_by } : {}),
    ...(isPresent(row.leased_until)
      ? { leasedUntil: new Date(row.leased_until) }
      : {}),
  });

const workQueueLayer = Layer.effect(
  WorkQueueService,
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    return {
      claim: (agent) =>
        Effect.gen(function* () {
          const now = Date.now();
          const leaseMs = 30 * 60 * 1000;
          const rows = yield* sql<Record<string, unknown>>`
            UPDATE work_units
            SET claimed_by = ${agent}, leased_until = ${now + leaseMs}
            WHERE id = (
              SELECT id FROM work_units
              WHERE claimed_by IS NULL OR leased_until IS NOT NULL AND leased_until < ${now}
              ORDER BY CASE WHEN claimed_by IS NULL THEN 0 ELSE 1 END, id
              LIMIT 1
            )
            RETURNING id, category, archetype, claimed_by, leased_until
          `;
          if (rows.length === 0) {
            return Option.none();
          }
          return Option.some(toWorkUnit(decodeWorkUnitRow(rows[0])));
        }),
      list: () =>
        Effect.gen(function* () {
          const rows = yield* sql`SELECT * FROM work_units ORDER BY id`;
          return rows.map((row) => toWorkUnit(decodeWorkUnitRow(row)));
        }),
      release: (id, agent) =>
        Effect.gen(function* () {
          yield* sql`
            UPDATE work_units
            SET claimed_by = NULL, leased_until = NULL
            WHERE id = ${id} AND claimed_by = ${agent}
          `;
        }),
      reopenExpired: (now) =>
        Effect.gen(function* () {
          const rows = yield* sql<Record<string, unknown>>`
            UPDATE work_units
            SET claimed_by = NULL, leased_until = NULL
            WHERE leased_until IS NOT NULL AND leased_until < ${now.getTime()}
            RETURNING id
          `;
          return rows.length;
        }),
      seed: (units) =>
        Effect.gen(function* () {
          let inserted = 0;
          for (const unit of units) {
            const id = `${unit.category}:${unit.archetype}`;
            const existing = yield* sql<Record<string, unknown>>`
              SELECT id FROM work_units WHERE id = ${id}
            `;
            if (existing.length > 0) {
              continue;
            }
            yield* sql`
              INSERT INTO work_units (id, category, archetype)
              VALUES (${id}, ${unit.category}, ${unit.archetype})
            `;
            inserted += 1;
          }
          return inserted;
        }),
    };
  })
);

const candidateStoreLayer = Layer.effect(
  CandidateStoreService,
  Effect.gen(function* () {
    const sql = yield* SqlClient;

    const findRow = (fingerprint: string) =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT * FROM candidates WHERE fingerprint = ${fingerprint}
        `;
        if (rows.length === 0) {
          return Option.none<CandidateRow>();
        }
        return Option.some(decodeCandidateRow(rows[0]));
      });

    const updateAfter = (fingerprint: string) =>
      Effect.gen(function* () {
        const maybe = yield* findRow(fingerprint);
        if (Option.isNone(maybe)) {
          return yield* CandidateNotFound.make({
            message: `no candidate ${fingerprint}`,
          });
        }
        return toSourceCandidate(maybe.value);
      });

    const submit = (input: SourceCandidateInput) =>
      Effect.gen(function* () {
        const fingerprint = candidateFingerprint(input.domain, input.url);
        yield* sql`
          INSERT OR IGNORE INTO candidates (
            fingerprint, domain, category, url, archetypes, access, transport,
            description, discovered_by, discovered_at, origin, status, notes
          ) VALUES (
            ${fingerprint}, ${input.domain}, ${input.category}, ${input.url},
            ${JSON.stringify(input.archetypes)},
            ${input.access ?? null}, ${input.transport ?? null},
            ${input.description ?? null}, ${input.discoveredBy ?? null},
            ${input.discoveredAt ? input.discoveredAt.getTime() : null},
            ${input.origin ?? null}, ${"new"}, ${"[]"}
          )
        `;
        const maybe = yield* findRow(fingerprint);
        if (Option.isNone(maybe)) {
          return yield* CandidateNotFound.make({
            message: "candidate insert did not persist",
          });
        }
        const existing = maybe.value;
        const m = mergedFields(existing, input);
        yield* sql`
          UPDATE candidates SET
            archetypes = ${JSON.stringify(m.archetypes)},
            access = COALESCE(access, ${input.access ?? null}),
            transport = COALESCE(transport, ${input.transport ?? null}),
            description = COALESCE(description, ${input.description ?? null}),
            discovered_by = COALESCE(discovered_by, ${m.discoveredBy ?? null}),
            discovered_at = COALESCE(discovered_at, ${m.discoveredAt ?? null}),
            origin = COALESCE(origin, ${input.origin ?? null}),
            notes = ${JSON.stringify(m.notes)}
          WHERE fingerprint = ${fingerprint}
        `;
        return yield* updateAfter(fingerprint);
      });

    return {
      enrich: (id, patch) =>
        Effect.gen(function* () {
          const maybe = yield* findRow(id);
          if (Option.isNone(maybe)) {
            return yield* CandidateNotFound.make({
              message: `no candidate ${id}`,
            });
          }
          const row = maybe.value;
          const archetypes = patch.archetype
            ? [
                ...new Set([
                  ...parseStringArray(row.archetypes),
                  patch.archetype,
                ]),
              ]
            : parseStringArray(row.archetypes);
          const notes = patch.note
            ? [...parseStringArray(row.notes), patch.note]
            : parseStringArray(row.notes);
          yield* sql`
            UPDATE candidates SET
              archetypes = ${JSON.stringify(archetypes)},
              access = COALESCE(access, ${patch.access ?? null}),
              transport = COALESCE(transport, ${patch.transport ?? null}),
              description = COALESCE(description, ${patch.description ?? null}),
              origin = COALESCE(origin, ${patch.origin ?? null}),
              notes = ${JSON.stringify(notes)}
            WHERE fingerprint = ${id}
          `;
          return yield* updateAfter(id);
        }),
      get: (id) =>
        Effect.gen(function* () {
          const maybe = yield* findRow(id);
          if (Option.isNone(maybe)) {
            return yield* CandidateNotFound.make({
              message: `no candidate ${id}`,
            });
          }
          return Option.some(toSourceCandidate(maybe.value));
        }),
      list: (filter: CandidateFilter) =>
        Effect.gen(function* () {
          const rows = yield* sql`SELECT * FROM candidates ORDER BY domain`;
          return rows
            .map((row) => toSourceCandidate(decodeCandidateRow(row)))
            .filter((candidate) => {
              if (
                filter.category !== undefined &&
                candidate.category !== filter.category
              ) {
                return false;
              }
              if (
                filter.status !== undefined &&
                candidate.status !== filter.status
              ) {
                return false;
              }
              if (
                filter.archetype !== undefined &&
                !candidate.archetypes.includes(filter.archetype)
              ) {
                return false;
              }
              return true;
            });
        }),
      markPromoted: (id, promotion) =>
        Effect.gen(function* () {
          const maybe = yield* findRow(id);
          if (Option.isNone(maybe)) {
            return yield* CandidateNotFound.make({
              message: `no candidate ${id}`,
            });
          }
          if (maybe.value.status === "promoted") {
            return yield* AlreadyPromoted.make({
              message: `candidate ${id} already promoted`,
            });
          }
          yield* sql`
            UPDATE candidates SET status = ${"promoted"}, promotion = ${JSON.stringify(promotion)}
            WHERE fingerprint = ${id}
          `;
          return yield* updateAfter(id);
        }),
      submit,
      supersede: (oldId, replacementId) =>
        Effect.gen(function* () {
          const maybe = yield* findRow(oldId);
          if (Option.isNone(maybe)) {
            return yield* CandidateNotFound.make({
              message: `no candidate ${oldId}`,
            });
          }
          yield* sql`
            UPDATE candidates SET status = ${"rejected"}, supersedes = ${replacementId}
            WHERE fingerprint = ${oldId}
          `;
          const updated = yield* findRow(oldId);
          if (Option.isNone(updated)) {
            return yield* CandidateNotFound.make({
              message: `no candidate ${oldId}`,
            });
          }
          return toSourceCandidate(updated.value);
        }),
    };
  })
);

const makeSourceCatalogSqliteLayer = (filename: string) => {
  const sqlClientLayer = sqliteClientLayer({ filename });
  const migratedLayer = Layer.merge(
    sqlClientLayer,
    sqliteMigratorLayer({ loader: migrations }).pipe(
      Layer.provide(sqlClientLayer)
    )
  );
  return Layer.merge(workQueueLayer, candidateStoreLayer).pipe(
    Layer.provide(migratedLayer)
  );
};

/** In-memory store for tests/one-shot runs. */
export const SourceCatalogSqliteLayer =
  makeSourceCatalogSqliteLayer(":memory:");

/**
 * SQLite will not create missing intermediate directories, so a configured path
 * like `<root>/.viokit/catalog.db` fails to open on a fresh checkout unless the
 * parent exists.
 */
const ensureParentDir = (filename: string): void => {
  if (filename === ":memory:" || filename.trim() === "") {
    return;
  }
  mkdirSync(dirname(filename), { recursive: true });
};

/** File-backed store for the CLI/MCP harness (persists across processes). */
export const makeSourceCatalogSqliteLayerFor = (filename: string) =>
  Layer.unwrap(
    Effect.sync(() => {
      ensureParentDir(filename);
      return makeSourceCatalogSqliteLayer(filename);
    })
  );
