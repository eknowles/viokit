# 04 — Web UI Architecture

> **Status:** Parking notes / working design. Companion to `01`, `02`, `03`. Nothing is a spec yet.
>
> Covers the web GUI: stack (React + Effect), schema-driven forms/views, client/server contract,
> and the 4D visualization canvas.

---

## 1. Stack

- **React + Effect.** Effect v4 runs in the browser (`@effect/platform-browser`). React is the view;
  Effect is the data layer. `@effect/react-hooks` (`useSuspend` et al.) bridges Effect to React
  Suspense — retries, structured concurrency, and navigation-cancellation come from Effect, not from
  bespoke fetch logic.
- **One client, one build** — a normal SPA (Vite + React). Server-rendering is not required.
- **Typed data fetching everywhere.** The client uses Effect's typed HTTP client; every response is
  decoded with a shared Effect Schema (see §3). Types flow server→client with zero duplication.
- **State layer: Effect, not a routing framework.** Client state (current investigation, selection,
  filters, results-workbench state) is held in small Effect services; React components subscribe via
  hooks; every mutation goes through Effect. URL routing is only for deep-linking (a minimal
  hash-based router if needed) — no full routing framework dependency.

---

## 2. UI structure

```
Web GUI (React + Effect client)
├─ Shell / layout · navigation · workspaces
├─ Graph canvas  ── 4D view: force-directed graph + time scrubber + map pane
├─ Results workbench ── streamed candidates: group/filter/cull before they touch the graph
├─ Investigation panel ── steps, timeline, evidence trail (replay-driven)
├─ Entity detail ── schema-driven card + custom view slot per type
├─ Transform launcher ── schema-driven input form + run → results stream
├─ Source / pack catalog ── from the self-describing catalog API
└─ Evidence viewer ── raw artifact + provenance chain (how/when/from-where)
```

- **Graph canvas is domain-agnostic** — it renders the graph projection API and the time/space
  dimensions. It does not know about companies or passports; packs only describe how *their* types
  look (see §4).
- **Live investigations** — the GUI subscribes to the WebSocket event stream: step completions and
  graph deltas appear as transforms fan out.

---

## 3. Client/server contract (shared schemas)

The single most valuable property of the UI:

- **One set of Effect Schemas is the contract** — used by CLI, MCP, REST/GraphQL API, *and* the web
  UI. A `SourceSpec`, a `TransformSpec`, an entity/relation type: defined once, decoded everywhere.
- API endpoints are defined as schema-encoded contracts; the client decodes responses with the same
  schema that produced them (compile-time agreement, runtime validation at the boundary — matches
  invariant I6).
- This means **packs define their own API surface implicitly**: new entity types + new transforms
  automatically become queryable and renderable in the UI with no UI code change.

---

## 4. Schema-driven forms & views (the key principle)

Refinement of "custom forms per source/transform": **generate from schema by default, custom only on
demand.**

### 4.1 Transform inputs → forms
- A `TransformSpec` declares its `input` as an Effect Schema (typed params + target entity/entities).
- The UI **generates the form from the schema** (schema → fields → validation → submit). A new
  transform gets a working form the moment it's registered.
- **Custom form components** are an escape hatch, used only when a source needs special UX:
  geolocation/map picker, date-range for chronolocation, media upload for reverse-image-search,
  tag/multi-select for hashtags. Registered per transform in the pack; fall back to generated form.

### 4.2 Entity/relation outputs → view models
- Each entity type in a pack optionally ships a **view spec** (declarative):
  - display name, icon, color/badge, thumbnail field
  - card layout: which attributes show, in what order, which are links/identifiers
  - default detail renderer + which fields open the evidence viewer
  - spatial/temporal hints (is this a geo type? an event?) so the canvas can place it
- A **custom component slot** per type handles complex renderers: map for geospatial types, timeline
  for events, media player for images/video, whois/metadata tables for domains, PNR/travel layouts.
- **Generic renderers cover everything else** — property table, key-value badges, identifier chips,
  timeline entries — driven by the schema alone.
- Same pattern for **relations**: label, direction styling, temporal badges.

### 4.3 The payoff
An agent adds a source + transform + new entity types to a pack; the UI grows the catalog, the
launcher form, and the output views automatically. UI work is the exception, not the rule.

---

## 5. 4D visualization

- **Graph pane** — nodes = entities, edges = relations, both carrying temporal extent; time scrubber
  filters what's visible at time `t` (birth/death of relations, event windows).
- **Map pane** — entities with spatial extent positioned on a map; overlays (street view, satellite)
  via pack-provided tile sources.
- **Timeline pane** — investigation steps + entity events along a time axis; the replay view shows
  the graph being built step-by-step (evidentiary trail).
- **Evidence pane** — click any node/edge → the claims and their evidence chain (acquisition path,
  source+version, raw artifact).

---

## 6. Result streaming & triage (the big-result problem)

**Scenario:** a subject like an IP address fires a pack of transforms — host/IP, DNS, certificates,
geolocation, WHOIS/ASN, breach correlation — and hundreds or thousands of candidate entities stream
back across many types. Dumping all of it straight into the graph would bury the subject. So between
"transform ran" and "graph updated" there is a **results workbench**.

- **Streaming, not blocking.** Transforms stream results as they complete over the WebSocket; the
  workbench renders incrementally, so the user starts culling before the last batch arrives.
- **Binary frames for large results.** WebSocket message protocol:
  - *Control / event messages* — Effect-Schema-encoded (transform status, step completion, errors).
  - *Large result batches* — **Arrow IPC frames** (columnar): compact, fast to transmit and to
    filter/pivot client-side. Arrow schema is derived from the entity type's Effect Schema.
  - *Discard / backpressure* — the client can drop or throttle batches on huge runs to bound memory.
- **The workbench.**
  - Group by entity type; filter by type, by **relevance**, by veracity/confidence, by time window.
  - Actions per candidate: **keep** (promote into the investigation graph with its evidence),
    **discard**, **defer** (park for later), **expand** (run the next transform on it).
  - Columnar data makes culling across thousands of rows fast (predicate filters, no re-render storm).
- **Relevance signals are engine-provided, not UI-guessed.** Add a `relatedness` query to the graph
  capability: rank candidates by graph distance from the subject, shared identifiers, temporal
  overlap, veracity, corroboration count. The workbench sorts by it.
- **Curation is recorded.** keep/discard/defer actions are written to the investigation log (who,
  when, on what basis) — curation is part of the evidentiary trail, and replay reproduces the graph
  exactly.

### 6.1 Surfaces — the same results, many views
The workbench renders the *same candidate set* across coordinated surfaces, so culling and review can
happen in whatever view fits the data:

- **Table** — virtualized data grid over the columnar (Arrow) batch; columns derived from the entity
  schema; sort/filter/batch keep-discard; best for *volume*.
- **Graph** — candidates as nodes with edges to the subject and to each other; expand-on-select;
  best for *relatedness*.
- **Map** — candidates with spatial extent pinned on a map; best for *where* (geolocation,
  transport, imagery packs shine here).
- **Timeline** — candidates/events along a time axis; best for *when* (the 4D dimension).
- **Detail / evidence** — the selected candidate's record + evidence chain.

**Linked selection ("coordinated multiple views"):** selection is a shared Effect service. Clicking a
table row highlights the graph node, the map pin, and the timeline marker; keep/discard/defer from
*any* surface writes the same step and updates all surfaces. This is the load-bearing UX idea — one
candidate set, many lenses, one trail.

### 6.2 Docking layout
- **Recommendation: adopt a docking-layout library (dockview is a strong fit — MIT, React-based,
  drag-and-drop docking, floating panels, tabs, serializable layout JSON) rather than building our
  own.** Docking is a fiddly, high-effort problem (drag geometry, tab management, floating windows,
  persistence, accessibility); it is not our differentiator. Our differentiator is the schema-driven
  surfaces and the linked-views data layer — invest engineering there.
- **Panels are pack view-specs.** Every panel is a schema-driven surface, and a transform/entity
  type's view spec declares its *default panes*: a geolocation transform opens `table + map +
  timeline`; a whois transform opens `table + detail`. The layout follows the data model, not
  bespoke code.
- **Layout is state, not markup.** Layout JSON is serialized per user/investigation (persisted via
  `investigations`/`governance`) and lives alongside workbench state in Effect services.
- If we ever do build our own, it is only the *layout container* (resizable panes + tabs) — and only
  after the surfaces are proven. `flexlayout-react` / `react-mosaic` are lighter alternatives to
  consider before committing to dockview or a custom build.

### 6.3 View-state persistence — ALL views (invariant I12)
Every view's state must save and load for the user across sessions and devices. This is a hard
invariant, not a nice-to-have. **View state ≠ investigation state:** view state is configuration
(layout, filters, selection), never evidence, and is deliberately excluded from the evidentiary trail.

- **Scope (all views):**
  - Dock layout — panels, tab sets, sizes, splitter positions, floating windows
  - Table — columns, order, widths, sort, filters, row selection, density
  - Graph — camera/zoom, selected nodes, hidden layers, layout config
  - Map — center, zoom, overlay toggles, tile source
  - Timeline — window, granularity, scrubber position, collapsed groups
  - Workbench — active surfaces, applied filters, sort, keep/discard/defer filters
  - Investigation panel — expanded steps, filters
  - Global prefs — theme, density, defaults
- **Design:**
  - **Schema-encoded** — a per-surface Effect Schema composed into one `ViewState` schema per
    (user, investigation); validated on load, versioned for migration (Effect Schema `Version`).
  - **Server-backed** — stored per user + investigation via the API (survives device changes,
    consistent for multi-user), with client-side cache for instant restore; local-first save + sync.
  - **Separated from the step log** — view state lives in its own store, never pollutes evidence.
  - **Serializable** — layout + view state round-trip through the same shared-schema contract (§3).
- **Backend:** pending TDR-012 (schema-encoded, per user+investigation, server-backed).

---

## 7. Open questions

1. **Schema→form generation** — build a small schema-driven form engine on Effect Schema AST, or adopt
   an existing schema-form generator. This is a real build item for the `visualization` capability.
2. **Effect Schema ↔ Arrow mapping** — a bidirectional mapping from entity-type schemas to Arrow
   schemas (field types, nested structs, schema-evolution tolerance). Needs a small mapping layer in
   the shared-contract module; the transport decision (WS + Arrow) is settled, the mapping contract
   is not.
3. **Custom renderer packaging** — custom view components ship with the pack (bundled), so packs have
   an optional "UI" payload alongside schema + handlers.
4. **Docking library** — adopt dockview vs `flexlayout-react`/`react-mosaic` vs a minimal custom
   container. Lean: adopt dockview; only reconsider if its API fights the 4D canvas or the
   linked-selection model.

---

## 8. Where this lives next

Seeds the `visualization` capability spec (graph/time/map/evidence panes, results workbench) and a
new `ui` concern (client, shared contracts, schema-driven forms/views, pack UI payloads, WS+Arrow
transport, **view-state persistence per I12**). The **shared-schema client/server contract**
(invariant I6) is the load-bearing decision that makes the whole thing cheap.
