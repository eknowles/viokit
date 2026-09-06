## Why

The console could drive the engine but not be *worked in*. It was a stack of
independent views over an ad-hoc stylesheet: to follow a lead you read a catalog
table, remembered a transform id, switched to a form, ran it, switched to a
graph, and read raw entity ids off identical circles. Nothing told you what was
in the case, what you had already looked at, or what was worth following next.

An investigator's actual loop is: start from something you know, expand it, judge
what came back, expand again. That loop had no surface. This change gives it
one, and gives the console a design system so the surface is consistent rather
than assembled per view.

## What Changes

- **A design system, as CSS.** `@viokit/ui`: design tokens, one stylesheet per
  component, and typed React wrappers that emit those classes and nothing else.
  Imported from the Claude Design project's `investigation-workbench` kit.
  Namespaced (`vk-`) and wrapped in cascade layers so a consuming app's own
  styles win without `!important`.
- **The console is rebuilt on it**, and is **dark by default** — the design
  system still ships light as its own default; the console chooses.
- **A case workbench.** Seed a value, see it on a canvas, select a node, run a
  transform from it, and the results land as connected nodes you expand in turn.
- **Transforms are matched to the node being expanded** by name equality between
  the transform's input fields and the node's identifier kinds or entity kind. A
  near miss is offered as a suggestion to confirm, never applied silently — the
  console holds no domain vocabulary and must not invent one.
- **A seed is not a fact.** A value you typed is drawn as unevidenced and is
  replaced by the real entity the moment a transform asserts it. Nothing enters
  the graph un-attributed.
- **Curation.** Keep, defer and discard per entity, persisted as view state.
  Discarding hides a row; it does not unsay an evidence-attributed step.
- **A case table in three states** — everything, one entity kind, or the
  relations — with sorting, and per-kind columns derived from the identifiers
  those entities actually carry. A column whose values are all images can be
  shown as a gallery.
- **The canvas becomes legible**: nodes coloured by entity kind with a legend,
  labelled by identifier value rather than raw id, and reflecting curation.

## Capabilities

### New Capabilities

- `design-system`: A framework-independent visual system delivered as CSS —
  tokens, theming, cascade layering, and a class contract — with typed React
  wrappers over it. Covers what a consuming app can rely on and override.

### Modified Capabilities

- `console`: Adds the case workbench (seed, expand, commit), transform-to-node
  matching, the curation model, the three table states with derived per-kind
  columns, and canvas legibility. Existing requirements are unchanged; these are
  additions.

## Impact

- **New package** `packages/ui` (`@viokit/ui`) in the workspace: CSS entry
  points and React components, source-first with no build step.
- **New dependency** `@tanstack/react-table` v9 in the console only. Deliberately
  not in `@viokit/ui`, which stays framework-independent.
- **`apps/console`**: new `case`, `case-table` and `case-columns` modules and the
  views over them; `Catalog`, `Evidence`, `Investigations`, `Launcher` and
  `Graph` moved onto design-system components; `styles.css` reduced to app-level
  glue over the design system.
- **View-state payload version 4 → 5**, adding the case selection and the
  curation map. Older documents read as absent and yield defaults, which is the
  behaviour `view-state` already requires.
- **No engine, schema or pack changes.** Everything here is derived from
  `replay`, `log`, `catalog_list`, `catalog_describe`, `run_transform` and
  `insert` as they already are.

### Known limitation this change does not fix

Per-kind columns are derived from `Entity.identifiers`, because that is the only
place per-kind facts can live: `Entity` carries no attribute bag, and
`OntologyDefinition` is a union of `Entity | Relation | Event` — an example
instance rather than a schema of fields. A pack therefore cannot declare that a
`person` has a photo; it can only attach one as an identifier. That works, and is
what the derivation leans on, but identifiers are meant to be *identifying*
values and using them as a general attribute store will strain — no types, no
ordering, no display-name, and every attribute becomes a candidate merge key for
entity resolution. Giving entities attributes is an invariant-level change
(graph fold, exports, bundle signing, and whether an attribute assertion is its
own evidence-attributed step) and belongs in its own proposal. The derivation is
written as the seam for it.
