# Viokit — Domain Pack Recipe

> The primary agent-facing workflow. A **domain pack** delivers: entity/relation/identifier types,
> sources, transforms, view specs, and tests — registered at runtime, never compiled into core.
> Context: `openspec/exploration/02-osint-landscape.md`. Archetypes are the stable shapes.

## When to use
- Adding a new OSINT domain (corporate-finance, people-identity, web-dns, travel-border, social, ...).
- Adding a new source or transform to an existing pack.

## The recipe

### 1. Scaffold the pack
```
packs/<pack-name>/
├── types.ts        # entity/relation/identifier types + view specs
├── sources.ts      # SourceSpec definitions
├── transforms.ts   # TransformSpec definitions + handlers
├── index.ts        # pack registration (types → sources → transforms)
└── test/           # source contract, transform, projection, attribution tests
```

### 2. Register types (ontology)
- Define entity/relation/identifier types as Effect Schemas, extending core primitives (temporal +
  spatial extent are inherited).
- Reuse existing types where they exist (`Person`, `Company`, `Place`, `Domain`, `Email`, `Phone`,
  `Profile`, `Identifier` are starter shared types). Only add what is genuinely new.
- **Rule:** types live in the pack, never in core (open-domain rule).

### 3. Define sources (SourceSpec)
Each source declares, all as schema:
- transport (http | dataset | browser) + endpoint/request construction
- auth (api keys, rotation strategy) 
- policies: backoff/retry/timeout/rate-limit/key-rotation
- **cache policy** (mode + ttl/maxStale) and **egress policy** (direct/proxy/cache-only) — these are
  runtime concerns, declared here, not in transform code (I4/I10)
- response schema → **projection** to entities/relations (never raw into the graph; projection is
  what enforces attribution and I2)

### 4. Define transforms
- Pick the **archetype**: lookup, search, resolve, geolocate, chronolocate, correlate, monitor,
  extract, archive, analyze.
- `TransformSpec`: input schema (typed params + target entity), output schema (entities/relations/
  events), handler. The handler gets only the SourceRuntime API — no raw network (I4).
- Attribution: every output edge/vertex carries the evidence produced by its source step (I2).

### 5. Add view specs (UI follows automatically)
- Per entity type: display name, icon/color, card layout, which fields are identifiers/links,
  spatial/temporal hints, default detail renderer.
- Per transform: default panes (e.g., geolocation → table+map+timeline; whois → table+detail).
- Optional custom component slots (map picker, media viewer) — only when generic rendering is
  insufficient. Generic renderers cover the rest.

### 6. Write tests
- Source contract: request construction, auth, policies honored, response decoded against schema.
- Transform: input→output, attribution to evidence, no fabricated edges.
- Projection: rows/JSON → entities/relations, identifier extraction.
- Evidence: correct `acquisitionPath` (live/cache/proxy) and provenance (I9).

### 7. Verify
- `tsc --noEmit`, `vitest run`, `npm exec -- ultracite check`.
- Run the invariant checklist (references/CONTRACT.md) — especially I2, I4, I6, I9.
- If the pack adds a store/transport/serialization dependency, a `decided` TDR is required first.

## Leaked-data packs (special care)
- Dataset transport: schema-mapping spec (columns → normalized records), raw-file hashing, projection.
- **Veracity/confidence is data**: record how acquired, who supplied, when, authenticity assessment;
  flag unverified; `correlate` upgrades to corroborated only via an independent source.
- Governance: redaction on ingest; secrets never cached/exported; sensitive types (passport,
  movement, plaintext passwords) behind access control + audit.

## Checklist
- [ ] Types registered via pack, not core
- [ ] Sources declare cache + egress policy (runtime-owned)
- [ ] Transforms attribute outputs to evidence; no raw I/O in handlers
- [ ] View specs present (generic default is fine)
- [ ] Tests pass; invariant checklist green
