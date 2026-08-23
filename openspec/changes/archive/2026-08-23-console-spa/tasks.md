# Tasks — Console SPA

> Prereqs: TDR-002 and TDR-008 `decided`. Consumes the TDR-017 HTTP surface; no package changes.

## 1. App scaffold

- [x] 1.1 `apps/console`: Vite + React + TypeScript, workspace-registered, depending on `@viokit/schema` and `effect`.
- [x] 1.2 Configure the API origin, defaulting to the local surface's loopback address.
- [x] 1.3 The in-repo `useAtom` binding over `useSyncExternalStore` (TDR-002).

## 2. Client

- [x] 2.1 `call(name, args)` over `POST /operations/:name`, turning 400/404/422 into typed failures rather than parsed bodies.
- [x] 2.2 Decode every response with `@viokit/schema`; treat published JSON Schema documents as opaque JSON.
- [x] 2.3 Discovery on load: read `GET /operations` so the console fails loudly against a deployment missing an operation it needs.
- [x] 2.4 Tests: each operation's response decodes; each error status becomes its typed failure.

## 3. Schema→form renderer

- [x] 3.1 Render primitives, enums, required/optional, and descriptions from a Draft-2020-12 document.
- [x] 3.2 Raw-JSON fallback for anything unrenderable, so the transform stays runnable.
- [x] 3.3 Custom-component registry keyed by transform id, taking precedence over the generated form.
- [x] 3.4 Tests: against the real documents `catalog_describe` publishes for the registered packs, plus a deliberately unrenderable schema.

## 4. Views

- [x] 4.1 Catalog: sources, transforms, and types; runnability and reason shown; filter to what can be run here.
- [x] 4.2 Transform launcher: generated form, run by catalog id, staged steps shown with evidence attribution, explicit commit.
- [x] 4.3 Evidence submission: `ingest` as a form, showing the stored evidence id for attribution and the engine's rejection when incomplete.
- [x] 4.4 Graph: entity lookup plus paths, timeline, spatial, and relatedness, results as tables, empty results reported as empty.

## 5. Verification

- [x] 5.1 Typecheck and lint clean; suites green.
- [x] 5.2 Run the console against a real local API and walk catalog → launch → commit → query end to end.
- [x] 5.3 Confirm no persisted view state: a reload returns to the initial view (I12 deferred, not half-satisfied).
- [x] 5.4 Confirm every action goes through an operation the other front-ends also expose (I8).
- [x] 5.5 Document starting the API and console together; record the outstanding I12 exit criterion in `ROADMAP.md`.
