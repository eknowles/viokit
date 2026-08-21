# Viokit — Session Memory (2026-08-21)

> Working state for the next session. Project: **Viokit** — Effect v4 OSINT investigation engine.
> Guardrails enforced by the `viokit-build` skill (hard TDR gate, invariants I1–I12, open-domain rule, build-order gates in ROADMAP.md). Use the `effect-ts` skill for all Effect code.

---

## Where we are on the roadmap

- **P0 (foundations)** — complete
- **P1 (source runtime: cache + egress)** — complete
- **P2 (transforms + graph)** — **complete** (transform framework, DuckDB graph store + query surfaces, entity correlate, and the `Engine` pipeline seam).
- P3 (interfaces/UI), P4 (governance + first packs) — not started
- **Next agreed build:** the first real pack, `web-dns`, driven through the source-discovery harness
  (see the promote-path defect under the 2026-08-21 section — it blocks promotion).

---

## Key facts about the codebase

- **Monorepo:** `packages/{schema,config,engine,sources,source-catalog}` + `viokit-site`.
- **Packages:** `@viokit/schema`, `@viokit/config`, `@viokit/engine`, `@viokit/sources`, `@viokit/source-catalog`.
- **Runtime:** Bun. **Stack:** Effect 4.0.0-beta.103, Effect Schema (schema-first, decode at every boundary = I6), vitest + `@effect/vitest`, ultracite (biome).
- **`effect` version is `4.0.0-beta.103`.** ⚠️ This beta's API differs from docs in several ways:
  - **No `Effect.catchAll`** — it does NOT exist. Error-catching tools available: `Effect.catchTag`, `Effect.catchTags`, `Effect.mapError`, `Effect.catchIf`. For a catch-all typed-error map, use `Effect.mapError(fn)` on the whole channel.
  - **`Random` has NO `uuidV7`.** It only has `next`, `nextBoolean`, `nextInt`, `nextBetween`, `nextIntBetween`, `shuffle`, `choice`, `withSeed`. Existing code uses `fnv1aHex` (in `engine/src/hash.ts`) for IDs.
  - **`Schema.decodeUnknownEffect(schema)` leaks `R = any`** when the schema comes from a `Schema.Class` field typed `Schema.Any`. **Fix used:** wrap `Schema.decodeUnknownSync` in `Effect.try` (clean `never` requirement). See `engine/src/transform.ts` `decodeInput`.
- **tsconfig:** `packages/{engine,schema,sources}/tsconfig.json` were broken because TS7 removed `baseUrl`. Fixed them to use `"paths": {"*": ["./*"]}` (matches `source-catalog`). Don't reintroduce `baseUrl`.
- **Graph model (I3):** the graph is a **derived projection** rebuilt from an append-only step log via replay. The materialized graph is NOT the source of truth — replay is. This is load-bearing.

---

## Decisions made

- **TDR-005 — graph store = DuckDB** — status **`decided` 2026-08-11** (`openspec/decisions/TDR-005-graph-store.md`).
  - DuckDB (embedded, MIT) as the graph store. The materialized 4D graph is a **replay projection** over the step log, exported as Arrow/Parquet.
  - Options considered: DuckDB / Postgres+AGE / ArcadeDB / SurrealDB (native graph DBs scoped out; ArangoDB, Kuzu, Neo4j, Memgraph, Turso recorded with reasons).
  - De-risked by a spike (`@duckdb/node-api` 1.5.5-r.4): 200k verts / 1.2M edges — load+index+project 478ms; timeline 1ms; spatial 1ms; recursive-CTE path (depth≤4) 3ms; BFS `relatedness` (depth≤3) 5ms. Recursive SQL is adequate.
  - Fallback if recursive SQL proves inadequate at scale: **ArcadeDB**.
- **TDR-015 — entity resolution (correlate)** — status **`decided` 2026-08-11** (`openspec/decisions/TDR-015-entity-resolution.md`).
  - Chosen approach: app-level `correlate` transform emitting evidence-attributed `ResolveEntity` steps (append-only, preserves I3/I2). Identifier **normalization to canonical forms is part of the mechanism** (strict deterministic match), per-kind `MatchRule`s in packs; fuzzy deferred to P4. Store-level rewrite rejected (violates I3/I11). Exercised through `Engine.correlate` in `pipeline-seam.test.ts`.

---

## P2 work completed in this session

**Workstream 1 — Transform framework (DONE, tested):**
- `packages/engine/src/transform.ts` + tests (2 passing). See summary below.

**Workstream 2 — DuckDB-backed GraphStore (DONE, tested):**
- `packages/schema/src/seams.ts`: extended `GraphStore` with 4 query surfaces: `paths(from,to,maxDepth)`, `timeline(from,to)`, `spatial(bbox)`, `relatedness(seed,maxDepth)` + result types `GraphPath`, `ExtentHit`, `BBox`, `RelatedEntity`.
- `packages/engine/src/graph-duckdb.ts`: new `DuckDBGraphService` + `DuckDBGraphLayer`. Raw `@duckdb/node-api@1.5.5-r.4` behind a thin Effect seam (per TDR-005 "soft choice behind a narrow seam"). In-memory DB (`DuckDBInstance.create()`). Append-only `step_log(seq, data JSON)` = system of record (I3); materialized `entities/relations/events` columnar tables rebuilt by `replay`. `insert` checks non-empty evidence (I2). Query surfaces: recursive CTEs for paths/relatedness (uses `list_append`/`list_contains`; base case frontier must be `target_id`, not `source_id` — a subtle bug fixed), time-range scans for timeline, bbox scan for spatial.
  - **Critical gotchas (documented for next time):**
    1. `Schema.encodeUnknownSync(Step)` emits Date as ISO string; `JSON.parse` back gives a string, but `decodeUnknownSync(Step)` (type schema) expects `Date` objects → "Expected a valid Date". **Fix:** a JSON `reviver` (`parseJson`) that converts ISO-8601 strings back to `Date`. Alternatively use `Schema.encodedSchema` (does NOT exist in this effect beta). The evidence-fs precedent manually rebuilds Dates.
    2. DuckDB `JSON` column returns a **string** via `getRowObjectsJS()`, so `parseJson` is needed before `decodeUnknownSync`.
    3. `connection.run(sql, values)` binds one row; for batch inserts build multi-row `VALUES (?,...),(?,...)` with flattened positional params.
    4. `@duckdb/node-api` is promise-based; wrap in `Effect.tryPromise`. `Effect.tryPromise` adds `UnknownError` — must `Effect.mapError` to the seam's error type.
  - `packages/engine/src/graph.ts` (in-memory): added the same 4 query surfaces for seam parity (BFS/DFS over folded maps, last-write-wins by id). This is the fallback layer.
- Tests: `test/graph-duckdb.test.ts` (7) + `test/graph.test.ts` extended to 7 (both cover I2, I3, and all 4 query surfaces). Full engine suite: **59 tests passing.**

**Workstream 4 — P2 exit proof: mini-investigation e2e (DONE, tested):**
- `packages/engine/test/mini-investigation.test.ts` (2 tests): threads whois → dns → breach through the real pipeline — `SourceRuntime.run` (real layers: Cache/Egress/RateLimit + a dispatch transport) → `EvidenceService.put` → `TransformRunner.run` (project evidence → graph operations) → `DuckDBGraphService.insert` → `replay`. Asserts entities/relations land in the graph, every step attributed to its evidence (I2), replay is deterministic (I3), and `relatedness("domain")` ranks acme (dist 1), ip (dist 1), breachX (dist 2). Full engine suite: **61 tests passing.**
- **Bug found & fixed along the way:** the transform runner built steps as plain object literals `{ evidenceIds, id, operation }`, which **fail `Schema.encodeUnknownSync(Step)`** (the `Step` `Schema.Class` requires `Step.make` instances). Fixed `packages/engine/src/transform.ts` to build `StepSchema.make(...)` + `NonEmptyEvidenceIds.make([stored.id])`.
- Full engine suite at the end of P2 (post pipeline-seam): **68 tests passing.**

---

## P2 work completed in this session (Workstream 1 details)

**Workstream 1 — Transform framework (DONE, tested):**
- `packages/schema/src/schemas.ts`: added `TransformArchetype` (10 literal archetypes), `TransformSpec` class (id, archetype, input/output/projection as `Schema.Any`, sourceId), `TransformError`.
- `packages/schema/src/seams.ts`: added `TransformRunner` interface + `TransformRunnerService` (Context.Service). Signature:
  ```
  run(spec: TransformSpec, source: SourceSpec, project: (evidence, input) => readonly StepOperation[], input) => Effect<readonly Step[], TransformError>
  ```
- `packages/engine/src/transform.ts`: new `TransformRunnerLayer`. Runs source through `SourceRuntime` (I4/I10, no raw fetch), persists evidence, decodes input against `spec.input` (I6, via `Effect.try`+`decodeUnknownSync`), projects to step operations, wraps each in a `Step` attributed to the run's evidence (I2). Returns staged steps; does NOT write to graph.
- `packages/engine/src/index.ts`: exports `./transform.js`.
- `packages/engine/test/transform.test.ts`: 2 tests passing (projection→attributed steps; rejects invalid input per I6).
- Full engine suite: **48 tests passing.**

---

## P2 work completed in this session (Pipeline seam, `p2-pipeline-seam`)

**Task scope — thread P2 services through the public `Engine` seam and default it to DuckDB (DONE, tested):**
- `packages/engine/src/engine.ts`: extended the `Engine` service with the four graph query methods (`paths`, `timeline`, `spatial`, `relatedness`), `runTransform(spec, source, project, input)` (→ `TransformRunnerService.run`), and `correlate(staged, existing, rules)` (→ `CorrelateResolverService.resolve`). The default `EngineLayer` now runs on `DuckDBGraphLayer` (TDR-005); the in-memory `GraphLayer` remains exported as a documented fallback. Layer gotchas: `TransformRunnerLayer` newly requires `EvidenceService`, so `EvidenceLayer` must be provided **last** in the pipe (`Layer.provide(EvidenceLayer)` after the transform/correlate/graph slices) or the sequential provides re-expose it as an unsatisfied requirement.
- `packages/engine/src/index.ts`: added `export * from "./graph-duckdb.js"`.
- `packages/engine/test/engine.test.ts`: the round-trip test now calls `replay` before `queryEntity` — the retained DuckDB store materializes the projection on replay, unlike the in-memory store which folds on insert. Added a comment documenting this.
- `packages/engine/test/pipeline-seam.test.ts` (3 tests): full pipeline through the public `Engine` seam — `runTransform` stages evidenced steps (I2), `insert` commits, `replay` is deterministic (I3), `correlate` folds a normalized duplicate into a `ResolveEntity` merge, and `relatedness` queries over DuckDB.
- Full engine suite: **68 tests passing.** `ultracite check` clean; only pre-existing codebase-wide `tsc` errors remain (evidence-fs `unknown`, node/DOM lib types).

---

## P2 work remaining

**Workstream 3 — Entity resolution** — **DONE** (TDR-015 `decided`, `correlate.ts` + tests; exercised through `Engine.correlate` in `pipeline-seam.test.ts`).

**Other P2 follow-ups (post-e2e, optional):**
- ~~Expose the 4 graph query surfaces (`paths`/`timeline`/`spatial`/`relatedness`) and the transform runner on the `Engine` service seam~~ — **DONE** (see above; `openspec/changes/p2-pipeline-seam`).
- ~~DuckDB graph persistence: file-path step-log persistence is a follow-up~~ — **DONE** (`openspec/changes/duckdb-graph-persistence`). Provide a `DuckDBConfig` (path string) to persist a durable store: `DuckDBGraphService.make` opens `DuckDBInstance.create(path)` (in-memory when absent/empty), keeps `CREATE TABLE IF NOT EXISTS` idempotent, and `dispose` (`closeSync`) releases a path for reopen. Reopening an existing path rebuilds the projection from the retained step log via `replay()` (I3/I11). See capabilities: `graph-persistence`, `graph-query`.

---

## Toolchain + config session (2026-08-21)

**Toolchain (the day it bit us):**
- **Bun must be >= 1.1.14.** `@effect/sql-sqlite-bun` calls `statement.safeIntegers()` on every
  prepare; that method landed in Bun v1.1.14. On older Bun every statement throws a TypeError that
  the client rewraps as the opaque `SqlError: Failed to execute statement` — all 12 store-backed
  `source-catalog` tests fail identically with no hint of the real cause. The machine had 1.1.10;
  upgraded to 1.4.0. Floor now recorded in root `package.json` `engines` and `devbox.json`.
- `.bun-version` is inert on its own — verified Bun does not auto-switch on it.
- **`devbox.json`** pins `bun@1.3.13` + `nodejs@22.23.2` (newest on nixhub) and puts
  `node_modules/.bin` on PATH. Requires devbox + Nix, which need a root install — not yet installed.
- **openspec CLI is `@fission-ai/openspec`** (the bare `openspec` npm name is an unrelated stub with
  no bin). Pinned as a root devDependency; run it as `bunx openspec` unless `node_modules/.bin` is
  on PATH. `openspec validate --all` passes on all 10 specs.

**`@viokit/config` (new package) — one place paths come from:**
- `findProjectRoot` walks up for `viokit.config.json` then `openspec/`, so nothing depends on the
  directory a CLI was invoked from. `loadViokitConfig` resolves env > `viokit.config.json` >
  defaults, decodes the file through Effect Schema (I6), and exposes `ViokitConfigService`.
- Deliberately **no c12/unjs dependency** — the defects were cwd-vs-root and a module-scope
  `process.env` read, both fixed in ~30 lines. Revisit c12 only if `.env`/extends chains are needed.
- `source-catalog` now takes `catalogDb` and `packsDir` from config;
  `SourceCatalogProgramLayer` resolves lazily via `Layer.unwrap` instead of reading env at import.
- Packs now default to `packages/sources/packs/<category>`.

**Bugs found and fixed along the way:**
- **`relatedness` was nondeterministic** — `ORDER BY distance` with no tiebreak meant equal-distance
  results came back in arbitrary order; `mini-investigation.test.ts` failed ~3 runs in 5. Both the
  DuckDB and in-memory seams now tie-break on `entityId`.
- **The catalog CLI had never worked on a fresh checkout** — SQLite will not create missing parent
  directories, so the default `.viokit/catalog.db` failed with "unable to open database file".
  `makeSourceCatalogSqliteLayerFor` now creates the parent first.
- **`.gitignore` had an unanchored `packs/`**, which matches at any depth — it would have silently
  ignored `packages/sources/packs/**`, i.e. the pack deliverables. Now root-anchored `/packs/`.

**Known defect, not yet fixed (blocks the web-dns pack):**
- `promote_source` takes `spec: unknown` and never validates it — the promoter `JSON.stringify`s
  whatever it gets into `export const X: SourceSpec = {…}`. The shape the `source-cataloging` skill
  documents (`name`/`category`/`domain`/`description`/`access`) is **not** a `SourceSpec` and emits a
  pack file that fails `tsc`. Fix by decoding against `SourceSpec` at the boundary (I6) before
  writing, and correct the skill's documented shape.

---

## Invariant checklist (run before every commit)

- [ ] No invariant violated (I1–I12) — see `.agents/skills/viokit-build/references/CONTRACT.md`
- [ ] All technology choices referenced have `decided` TDRs
- [ ] New domain content is in a pack, not core
- [ ] `npm exec -- ultracite check`, `tsc --noEmit`, tests all green

## Verification commands

- Typecheck (per package): `bun run --filter '@viokit/<pkg>' typecheck`
- Tests: `cd packages/engine && bunx vitest run`
- Lint: `npm exec -- ultracite check` / `npm exec -- ultracite fix`
