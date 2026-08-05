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
| TDR-005 | Shared graph store — Postgres vs SurrealDB vs Neo4j | proposed | Postgres for Compose/K8s; SQLite standalone |
| TDR-006 | Cache backends — Redis (L2), object store (L3) | proposed | Redis + S3/MinIO per topology |
| TDR-007 | Evidence store — filesystem vs S3/MinIO | decided 2026-08-05 | filesystem content-addressed first; S3/MinIO behind same seam |
| TDR-008 | Schema→form generation — build vs adopt | proposed | open (real build item) |
| TDR-009 | Effect Schema ↔ Arrow mapping approach | proposed | open (real build item) |
| TDR-010 | Evidentiary bundle export format | proposed | open |
| TDR-011 | Egress / identity–proxy model | proposed | open (gates browser transport) |
| TDR-012 | View-state persistence backend | proposed | schema-encoded, per user+investigation, server-backed |

## Workflow
1. Create a TDR from the template; fill **Context** and **Options**; mark `proposed`.
2. Research + evaluate against criteria; mark `in-review`.
3. Human review; mark `decided` with a one-line decision summary + date.
4. If circumstances change, write a new TDR that supersedes the old one (`superseded`).

> **Enforced by the `viokit-build` skill:** the TDR gate is hard — no technology is implemented until
> its TDR is `decided`. Statuses below reflect how far each has been *worked*.
