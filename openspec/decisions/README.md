# Technology Decisions Index

> **Rule:** a technology choice is **not made** until its TDR is written (options, criteria, trade-offs,
> recommendation) and reviewed. Statuses below reflect how far each has been *worked* — none are
> settled until they say `decided`.
>
> Format: `openspec/decisions/TEMPLATE.md`. Numbered `TDR-001` onward.

| TDR | Topic | Status | Lean / direction noted |
|---|---|---|---|
| TDR-001 | Runtime — Bun vs Node vs Deno | decided 2026-08-04 | Bun primary + manager; Node drop-in via Effect platform |
| TDR-002 | Client state & routing | proposed | Effect-lean; no routing framework; hash router only if deep-linking |
| TDR-003 | Real-time transport — WebSocket vs SSE | proposed | WebSocket + Arrow IPC frames for large result batches |
| TDR-004 | Docking layout — dockview vs flexlayout-react vs react-mosaic vs custom | proposed | dockview, unless it fights 4D canvas / linked selection |
| TDR-005 | Shared graph store — DuckDB vs Postgres+AGE vs ArcadeDB vs SurrealDB | decided 2026-08-11 | DuckDB (embedded, MIT): graph = replay projection over the step log, Arrow/Parquet output; spike confirmed recursive-SQL paths/relatedness fast at 1.2M edges; ArcadeDB fallback |
| TDR-006 | Cache backends — filesystem (L2) vs Redis vs object store | decided 2026-08-05 | `CacheStore` seam; filesystem L2 first (standalone), Redis/object store deferred |
| TDR-007 | Evidence store — filesystem vs S3/MinIO | decided 2026-08-05 | filesystem content-addressed first; S3/MinIO behind same seam |
| TDR-008 | Schema→form generation — build vs adopt | proposed | open (real build item) |
| TDR-009 | Effect Schema ↔ Arrow mapping approach | proposed | open (real build item) |
| TDR-010 | Evidentiary bundle export format | proposed | open |
| TDR-011 | Egress / identity–proxy model | decided 2026-08-05 | runtime-owned `Egress` stage (direct/proxy/disabled); identity↔egress binding; gates browser transport |
| TDR-012 | View-state persistence backend | proposed | schema-encoded, per user+investigation, server-backed |
| TDR-013 | Source-catalog store — SQLite vs filesystem vs in-memory | decided 2026-08-05 | `CandidateStore`/`WorkQueue` seams; SQLite single-file first (atomic claims + dedup); filesystem fallback |
| TDR-014 | Source-catalog front-end — MCP server + CLI | decided 2026-08-05 | stdio MCP (`@modelcontextprotocol/sdk` v1) for agents + thin CLI; both over one `SourceCatalogService` |
| TDR-015 | Entity resolution / dedup (correlate) | decided | app-level `correlate` transform emitting evidence-attributed `ResolveEntity` steps (I2/I3); identifier **normalization to canonical forms is part of the mechanism** (strict deterministic match); schema rules in packs; fuzzy deferred to P4 veracity; store-rewrite rejected (I3/I11) |
| TDR-016 | Engine front-end — MCP + CLI over `Engine` | decided 2026-08-23 | stdio MCP (`@modelcontextprotocol/sdk` v1) + thin CLI in `packages/agent`, one program layer; thin zod wire, authoritative Effect Schema decode; JSON Schema via `effect/JsonSchema` at `describe`; network API deferred to TDR-003 |
| TDR-017 | Local HTTP API — generic adapter vs schema-first `HttpApi` | decided 2026-08-23 | `HttpRouter` over the shared operation table (`POST /operations/:name` + self-describing `GET /operations`); parity stays structural; `HttpApi`/OpenAPI deferred until the operation set settles or a remote consumer appears |

## Workflow
1. Create a TDR from the template; fill **Context** and **Options**; mark `proposed`.
2. Research + evaluate against criteria; mark `in-review`.
3. Human review; mark `decided` with a one-line decision summary + date.
4. If circumstances change, write a new TDR that supersedes the old one (`superseded`).

> **Enforced by the `viokit-build` skill:** the TDR gate is hard — no technology is implemented until
> its TDR is `decided`. Statuses below reflect how far each has been *worked*.
