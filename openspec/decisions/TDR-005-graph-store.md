# TDR-005 — Graph store: DuckDB (replay projection) vs Postgres+AGE vs ArcadeDB vs SurrealDB

- **Status:** decided
- **Owner:** core
- **Date:** 2026-08-11
- **Related:** TDR-001 (runtime), TDR-003 (WS+Arrow transport), TDR-006 (cache), TDR-007 (evidence store), TDR-009 (Effect↔Arrow mapping); ROADMAP P2; CONTRACT I2/I3/I5/I6/I7/I9/I11; `openspec/exploration/03-system-architecture.md` §2/§6 (GraphStore, replay as source of truth)

## Decision summary
> Adopt **DuckDB (embedded, MIT)** as the graph store: the materialized 4D graph is a **replay projection** computed by folding the append-only step log, materialized as columnar tables with Arrow/Parquet output. Native graph databases (ArcadeDB, SurrealDB, Neo4j, Memgraph, ArangoDB) and Postgres+Apache AGE are retained as considered-and-scoped-out options; ArcadeDB is the documented fallback if native Cypher traversal is proven necessary. **Decided 2026-08-11** after a de-risking spike confirmed recursive-SQL paths and `relatedness` are fast at OSINT scale.

## Context
- P2 needs a `graph` capability: an **append-only step log** + a **materialized 4D graph** with queries (paths, timelines, spatial, `relatedness`). Per `03-system-architecture.md`, the graph is a *derived projection* — "derived graph state is not cached; it is rebuilt from the step log; replay is the source of truth." This is the decisive architectural fact: **the graph store is a rebuildable read-model, not the system of record.** The step log is the system of record and can live in a separate, simpler store.
- Constraints: Effect v4 + schema-first (I6 decode at every boundary; the schema is shared across CLI/API/MCP/UI); append-only + deterministic replay (I3/I11); every vertex/edge carries Step→evidence provenance (I2); temporal validity (I5) and source versioning (I7); cache transparency (I9). Deployable across all three topologies: standalone (embedded), Compose (Docker), K8s. No technology is implemented until this TDR is `decided`.
- What it affects: the `graph` capability (packages), the step-log serializer, how the API/UI/agents query paths/timelines/spatial/`relatedness`, and the replay mechanism used by the investigation panel and evidentiary export.

## Options considered

### Option A — DuckDB (embedded analytical; MIT)
- **Description:** embed DuckDB in-process; the materialized graph is a set of columnar tables (vertices, edges, temporal + spatial columns) written by a replay fold over the step log; queries are SQL over those tables (recursive CTEs for paths, time-range scans for timelines); results export natively to Arrow/Parquet.
- **Pros:** matches the replay-as-projection model exactly; MIT (OSI-open, no single-vendor BSL risk); zero server / zero ops in all three topologies (embedded file, Docker trivial, no cluster); columnar storage + vectorized execution give fast time-range and join scans for the 4D surfaces; **native Arrow/Parquet output pairs directly with the planned Effect↔Arrow work (TDR-009/TDR-003)** — the materialized graph is already in the transport format; deterministic offline replay (I11) is a pure projection over local files; Effect bindings (effect-platform DuckDB) keep it schema-first.
- **Cons:** graph traversals are not Cypher — paths and `relatedness` are hand-written recursive SQL (more effort, harder to read than a graph query); no incremental/stateful graph (a rebuild recomputes the projection — acceptable since the graph is derived anyway); analytical engine, so point writes to the *materialized* graph are not the intent (the log is written append-only; the projection is recomputed).

### Option B — Postgres + Apache AGE
- **Description:** Postgres holds the step log; Apache AGE (or recursive SQL) provides graph semantics over it.
- **Pros:** mature, battle-tested, the user already knows it well; permissive license; Postgres is already a reasonable multi-node Compose/K8s fit; proven operational story.
- **Cons:** graph is *bolted on* (AGE extension, or hand-rolled recursive CTEs — same traversal-effort problem as DuckDB but with a server to operate); a running service in the standalone topology (breaks the embedded posture of TDR-006/007); columnar/time-range analytics are weaker than DuckDB for large temporal scans; Arrow interop requires an extra bridge (postgres wire → Arrow), less direct than DuckDB.

### Option C — ArcadeDB (native multi-model doc+graph; Apache-2.0)
- **Description:** single-jar, Docker-friendly native graph + document DB with Cypher/Gremlin/GraphQL.
- **Pros:** clean Apache-2.0 license; real native traversal (paths/`relatedness` as Cypher, not recursive SQL); single-jar deployment is much easier than ArangoDB/Neo4j; good fit if the graph is meant to be *lived in* rather than recomputed.
- **Cons:** treats the graph as stateful store (tension with replay-as-source-of-truth: history/rebuild becomes your discipline, not the engine's); younger, smaller-community server to operate (a running service in standalone); traversal payoff only materializes if native graph features are genuinely required; no first-class Arrow output (extra bridge).

### Option D — SurrealDB (native multi-model; BSL 1.1)
- **Description:** native multi-model (doc + graph + SQL) with versioned records / time travel.
- **Pros:** strong native graph + multi-model ergonomics; versioned/temporal queries.
- **Cons:** **BSL 1.1 (source-available, not OSI-open)** — single-vendor coupling and a rolling Apache-2.0 change-date, a real concern for an OSINT/evidentiary product; versioning is *storage-write-time*, orthogonal to I5 *fact-time* — its headline temporal feature doesn't serve the temporal axis that matters; younger, single-vendor ops.

### (Scoped out — recorded)
- **Kuzu** — MIT, embedded, fast, Cypher; **archived Oct 2025** (company acquired by Apple); pin 0.11.3 or fork → risky as a foundation.
- **Neo4j CE** — ecosystem leader; **GPLv3** community (may bite if distributing); server to operate.
- **Memgraph** — fast in-memory; **BSL** + memory-capacity planning.
- **ArangoDB** — native graph, Apache-2.0; **heavy deployment/ops + AQL learning curve** (per user assessment).
- **Turso/libSQL** — MIT distributed SQLite; **not a graph engine**; edge-distribution focus irrelevant to Viokit's server-side single-primary topology; doesn't add graph semantics over plain SQLite.

## Evaluation criteria
Ordered:
1. Fit with replay-as-source-of-truth architecture (graph is a derived projection, I3/I11)
2. Effect/schema-first fit + Arrow/Parquet output (I6, TDR-003/009)
3. Licensing & supply-chain risk
4. Ops & deployment cost (standalone → Compose/K8s)
5. Graph-query ergonomics for P2 surfaces (paths, timelines, spatial, `relatedness`)
6. Ecosystem maturity & effort to integrate/learn

## Analysis
- **Fit (1) — decisive.** Viokit's own architecture says the graph is *rebuilt from the step log*. DuckDB *is* that model: the materialized graph is a projection over the log, recomputable at will. ArcadeDB/SurrealDB treat the graph as stateful store, which inverts the dependency — you then fight the engine to reproduce "replay is the source of truth." → DuckDB wins cleanly.
- **Arrow fit (2).** DuckDB reads/writes Arrow and Parquet natively. Because the graph is a DuckDB projection, the query result is *already* in Arrow — the format the API/UI/agents and TDR-009 intend to carry. Postgres needs a wire→Arrow bridge; ArcadeDB/SurrealDB need a schema-mapped bridge. DuckDB removes an entire serialization layer.
- **License (3).** DuckDB (MIT) and Postgres (permissive) and ArcadeDB (Apache-2.0) are clean; SurrealDB (BSL) and Memgraph (BSL) and Neo4j CE (GPLv3) carry source-available/copyleft caveats that are undesirable for an evidentiary OSINT product. → DuckDB is the only clean-license option that also wins (1)/(2).
- **Ops (4).** DuckDB is embedded — no running service in any topology, consistent with the filesystem-first posture of TDR-006/007 and SQLite standalone. ArcadeDB/SurrealDB/Neo4j are servers to operate; Postgres is a server too (fine in Compose/K8s but heavier for standalone). → DuckDB lowest cost.
- **Graph ergonomics (5) — the trade-off we accept.** DuckDB has no Cypher: paths and `relatedness` are recursive SQL CTEs. This is the one criterion DuckDB gives up vs ArcadeDB/SurrealDB. It is *prototypable and testable in P2*; if it proves inadequate, ArcadeDB is the fallback (documented below), and the step-log serializer is designed so the projection is portable.
- **Maturity (6).** DuckDB is widely adopted, actively maintained, MIT, with a mature Effect binding. ArcadeDB is younger with a smaller community; SurrealDB single-vendor. → DuckDB lowest effort/risk on the dimension that also satisfies (1)–(4).

Trade-off made explicit: we trade **Cypher traversal ergonomics** for **architectural honesty (replay projection), native Arrow output, clean licensing, and zero-ops deployment**. Because the graph is *derived*, the query layer is a smaller, more replaceable surface than a stateful graph store would be.

## Recommendation
- **Chosen:** **DuckDB (embedded, MIT)** as the graph store (Option A). The step log is the system of record (SQLite/file per the standalone posture); the materialized 4D graph is a DuckDB projection rebuilt by replay, exported as Arrow/Parquet. This is a **soft** choice behind a narrow `GraphStore` seam — swapping the projection backend later is a backend change, not a contract change (per `STAGED_BUILD.md` anti-rework lever).
- **De-risking spike (2026-08-11):** the single flippable risk — whether recursive-SQL paths and `relatedness` are practical at scale — was validated. On a Viokit-shaped materialized graph (200k vertices / 1.2M edges with temporal + spatial columns): load+index+project 478ms; timeline scan 1ms (695k rows); spatial bbox 1ms; recursive-CTE path (depth ≤4) 3ms (785 distinct dests); BFS `relatedness` (depth ≤3) 5ms with ranked+typed results. Recursive SQL is **adequate** for all four P2 query surfaces at OSINT scale. The decision trigger did not fire.
- **What would change this decision:** a P2 result showing `relatedness`/path/timeline/spatial queries degrade at *actual* production graph scale beyond the spiked 1.2M edges (then **ArcadeDB** becomes the fallback — native traversal, still Apache-2.0). Also: a hard requirement to share the graph across a fleet at runtime with live incremental updates (then ArcadeDB or a server graph engine behind the same seam). A mandate for OSI-open-only *native graph* would also weight ArcadeDB upward.

## Open questions
- (Resolved by spike) Recursive-SQL paths and `relatedness` are adequate at 1.2M-edge scale; re-benchmark at production scale before large deployments.
- (Resolved in implementation, 2026-08-11) **DuckDB Effect binding:** `@effect/sql-duckdb` does not exist in the aligned effect beta set, so the graph store uses **raw `@duckdb/node-api` (1.5.5-r.4, the spike version) behind a thin Effect seam** (`graph-duckdb.ts`). Schema-first decoding (I6) happens in the projection fold, not the DB layer. Queries are `Effect.tryPromise` + `mapError` to the seam error type. Keeps the backend swappable per the "soft choice behind a narrow seam" stance.
- (Resolve in implementation) Step-log serializer location (SQLite/JSONL per standalone posture) and the replay fold that materializes the DuckDB projection. (2026-08-11: implemented as an in-memory DuckDB with an append-only `step_log` JSON table; file/SQLite persistence is a follow-up.)

## References
- `openspec/decisions/README.md` TDR-005 row; TDR-001/003/006/007/009; `STAGED_BUILD.md`; `ROADMAP.md` P2; `openspec/exploration/03-system-architecture.md` §2/§6; CONTRACT I2/I3/I5/I6/I7/I9/I11.
