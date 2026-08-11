---
name: source-cataloging
description: >
  Discover OSINT sources via web search and record them in the Viokit source
  catalog (claim a work unit -> web search -> submit a candidate -> enrich ->
  promote into a pack SourceSpec), using the `viokit-source-catalog` MCP tools
  (claim_work, submit_candidate, enrich_candidate, list_candidates,
  promote_source). Use this whenever the user wants to find/collect/catalog
  OSINT sources, "add sources to the catalog", "find sources for <category>",
  "research data sources", "build a pack/source list", or "do source discovery"
  -- even if they don't name the harness. It is the front-end for the source
  discovery work queue, so also reach for it when the user wants to work down a
  list of categories/archetypes (corporate-finance, web-dns, geospatial-maps,
  conflict-security, etc.), or to **mine a curated OSINT list** (e.g.
  github.com/jivoi/awesome-osint) for gold sources to catalog.
---

# Source Cataloging

This skill drives Viokit's source-discovery harness: it turns web research into
recorded, classified, promoted source candidates. The harness does **not** search
the web itself -- **you** do the searching, then use the MCP tools to log what you
find. That separation is intentional: the catalog records sources, the search is
yours.

The end state of a well-done unit is a promoted `SourceSpec` in
`packs/<category>/sources.ts` (the input a runnable Viokit source is built from).

## Tooling

The `viokit-source-catalog` MCP server exposes five tools. They call the same
`SourceCatalogService` as the CLI, so either works; prefer MCP when available,
fall back to the CLI when not.

| Tool | Purpose |
|---|---|
| `claim_work` | Get the next unclaimed `{category, archetype}` unit for an agent (30-min lease) |
| `submit_candidate` | Log a discovered source; dedups by `(domain, url)` |
| `enrich_candidate` | Fill unset classification/provenance on a candidate |
| `list_candidates` | List/filter candidates by category/archetype/status |
| `promote_source` | Promote a candidate into a pack `SourceSpec` (writes the file) |

CLI fallback (from the repo root):

```bash
export VIOKIT_CATALOG_DB=.viokit/catalog.db
bun packages/source-catalog/src/cli.ts seed                     # one-time: fill the work queue
bun packages/source-catalog/src/cli.ts claim --agent <id>
bun packages/source-catalog/src/cli.ts submit --category <c> --domain <d> --url <u> --archetype <a>
bun packages/source-catalog/src/cli.ts enrich --id <id> [--access <a>] [--transport <t>] ...
bun packages/source-catalog/src/cli.ts promote --id <id> --spec '<json>'
```

## Enum reference (use exact values)

`submit_candidate`/`enrich_candidate`/`promote_source` validate these strictly.
A wrong value returns a `ValidationError`.

- **Categories**: `corporate-finance`, `people-identity`, `social`, `web-dns`,
  `geospatial-maps`, `imagery`, `media-forensics`, `transport`, `environment`,
  `conflict-security`, `data-breaches`, `crypto-finance`, `infra-devices`,
  `travel-border`
- **Archetypes**: `lookup`, `search`, `resolve`, `geolocate`, `chronolocate`,
  `correlate`, `monitor`, `extract`, `archive`, `analyze`
- **access** (how a source is reached): `open_api`, `dataset`, `browser_scrape`,
  `requires_key`, `unknown`
- **transport**: `http`, `dataset`, `browser`, `unknown`

## Workflow

Run the loop until the user is satisfied or the queue for a target is empty.

### 1. Ensure the queue is seeded
If `list_candidates` is empty and `claim_work` returns nothing, the queue needs
seeding (the MCP server has no seed tool). Seed once via the CLI:
```bash
export VIOKIT_CATALOG_DB=.viokit/catalog.db
bun packages/source-catalog/src/cli.ts seed
```

### 2. Claim a unit
`claim_work` with a stable agent id (e.g. `agent-<category>`). It returns a
`{category, archetype}` unit (or none when the queue is drained). Work one unit
at a time so each search is focused. If the user gave a specific category, keep
claiming until you land on it (or submit candidates under it directly).

### 3. Search the web
Search for real, reachable sources that fit the claimed `category` and serve the
`archetype`. Favor sources that are:
- **Authoritative** — the organization/registry that owns the data, not an
  aggregator copy or a third-party re-host.
- **Documented and reachable** — a stable canonical URL, ideally a described
  API or dataset download.
- **Verifiable** — you can identify what the source is, who runs it, and roughly
  how often it updates. If you can't, log it as a `new` candidate for human
  review rather than promoting it.

### 4. Submit candidates
For each source worth keeping, `submit_candidate`:
- `category` = the claimed category; `archetypes` = one or more (match the unit
  plus any others the source genuinely serves).
- `domain` = the source's root domain (e.g. `acleddata.com`); `url` = the
  canonical landing/API page.
- Optional: `access`, `transport`, `description`, `discoveredBy`.
- Because submit dedups by `(domain, url)` and unions archetypes/notes, it's safe
  to log the canonical URL even if another agent already found it.

### 5. Enrich (optional)
`enrich_candidate` fills classification/provenance. Note: enrichment only sets
fields that aren't already set (first classification wins), so it's for adding
new detail, not overriding.

### 6. Promote
Once a candidate is solid (identified, classified, reachable), `promote_source`
with a `SourceSpec`:
```json
{
  "name": "<human-readable name>",
  "url": "<canonical url>",
  "category": "<category>",
  "domain": "<root domain>",
  "description": "<what it is>",
  "access": "<access enum>",
  "transport": "<transport enum>"
}
```
This writes `packs/<category>/sources.ts` and marks the candidate `promoted`.
Promoting is one-shot: a second `promote_source` on the same candidate fails with
`AlreadyPromoted` (that's expected; don't treat it as an error in your loop).

## Mining a curated OSINT list (autonomous)

When the user points you at a curated list (e.g. `jivoi/awesome-osint`) or asks you
to "mine" a list for sources, do the searching/extraction yourself:

1. **Extract the entries** instead of reading the whole README (curated lists are
   often 100KB+ of prose). Run the bundled helper (from the repo root):
   ```bash
   bun .agents/skills/source-cataloging/scripts/mine-list.ts \
     https://raw.githubusercontent.com/jivoi/awesome-osint/master/README.md > /tmp/list.json
   ```
   It emits a compact `[{section, name, url, desc}]` array. For a local `.md`
   file pass a path instead of a URL.

2. **Map sections to categories.** Translate the list's sections to Viokit
   categories so you can route candidates. From `awesome-osint`:
   - Domain/IP/DNS, Web History, Similar Sites -> `web-dns`
   - Geospatial, Maritime, Vehicle -> `geospatial-maps`
   - Image Search/Analysis, Video -> `imagery` / `media-forensics`
   - People Investigations, Username/Email/Phone, Social, Telegram/Twitter/etc -> `people-identity` / `social`
   - Company Research, Job Search -> `corporate-finance`
   - News, Threat Intelligence, Live Cyber Threat Maps, Threat Actor -> `conflict-security`
   - Data Breach Search Engines, Pastebins -> `data-breaches`
   - Data and Statistics, Academic, Document Search -> `web-dns` / `data-breaches` (judge by content)
   - Anything browser/VPN/tool-focused is usually **not** a catalog source.

3. **Judge gold** from the extracted JSON (you read the compact `url` + `desc`,
   not the prose). Promote only sources that are:
   - a **data source**: registry, database, API, dataset, or authoritative service
     -- **not** a client tool you install, a browser extension, or a script.
   - **durable and canonical**: stable URL, identifiable operator.
   - **reachable** (spot-check the top candidates with a fetch if uncertain).
   - Skip dead links, aggregators that just proxy others, and one-off widgets.

4. **Submit + promote** using the same MCP/CLI tools as the manual workflow: for
   each gold source `submit_candidate` with its mapped `category` + a fitting
   `archetype`/`access`/`transport`, then `promote_source` the strongest ones.
   Dedup is safe: submitting the canonical URL just merges if already found.

Be selective -- a curated list has hundreds of entries, but the catalog wants the
few dozen authoritative data sources, not a mirror of the whole list.

## Handling errors

- `ValidationError` — you used a value outside the enum reference above. Fix and
  resubmit.
- `CandidateNotFound` — the id is wrong or belongs to another store; re-list.
- `AlreadyPromoted` — candidate is already in a pack; skip it.
- `ClaimConflict` — another agent won the race; just `claim_work` again.

## Reporting to the user

When done (or when the queue is empty), summarize concisely:
- how many candidates submitted, enriched, and promoted (by category),
- where the promoted packs landed (`packs/<category>/sources.ts`),
- anything left as `new`/unresolved and why (uncertain provenance, paywalled,
  dead link) for a human to review.

## Not this skill's job

- The harness does not search, scrape, or fetch source data. **You** do the web
  search / list mining; the tools only record.
- Promoting every find is not the goal. Quality over volume: only promote sources
  you're confident are real and useful; leave the rest as candidates.
