# TDR-002 — Console stack and client state

- **Status:** in-review
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** `openspec/exploration/04-web-ui.md` §1; TDR-001 (Bun); TDR-017 (the HTTP surface the console consumes); TDR-012 (view-state persistence, `proposed`); invariants I6, I8, I12

## Decision summary
> _Pending review._

## Context
- `apps/console` is the first browser client. It consumes the local HTTP surface (TDR-017), which is self-describing: `GET /operations` lists what can be called, and `catalog_describe` publishes each transform's contract as JSON Schema.
- Constraints: Effect 4.0.0-beta.103; the client must decode with `@viokit/schema` rather than hand-written DTOs (I6, `04-web-ui.md` §3); the console is one more surface over the same operations, with no privileged path (I8).
- **The beta changed the landscape.** `04-web-ui.md` §1 assumed `@effect/platform-browser` and `@effect/react-hooks`. Neither is what shipped: this beta carries `effect/unstable/reactivity` in-package — `Atom`, `AtomRegistry`, `AsyncResult`, `AtomRef`, `Hydration` — which is a reactive state layer with no external dependency. `@effect/react` is unpublished; the ecosystem React binding is `@effect-atom/atom-react` (0.7.0), a separate package pairing with `@effect-atom/atom` rather than the copy vendored into `effect`.
- This TDR also covers the **stack itself** (React, Vite), because a UI dependency requires a decided TDR.
- Affects `apps/console` only.

## Options considered

### Option A — React + Vite; state in `effect/unstable/reactivity` Atom; a hand-written React binding
- **Description:** Atoms hold client state and wrap calls to the HTTP surface; a small `useAtom` built on `useSyncExternalStore` (roughly 30 lines) subscribes React to them. Routing: none — the console is a handful of views selected by ephemeral component state.
- **Pros:** No new runtime dependency beyond React itself; the state layer is version-locked to the `effect` we already pin, so it cannot drift from the schemas it carries. Matches the exploration's intent (client state in Effect, not a store library) with what the beta actually ships. If `@effect-atom/atom-react` proves compatible later, swapping in its hooks is a local change.
- **Cons:** We write and maintain the React binding, however small. `unstable/` by name — the API may move under us.

### Option B — React + Vite; `@effect-atom/atom-react` for state and hooks
- **Description:** Adopt the ecosystem binding and its `useAtom`/`useAtomValue` hooks.
- **Pros:** Hooks, devtools, and patterns already worked out; nothing bespoke to maintain.
- **Cons:** Pairs with `@effect-atom/atom`, not the `Atom` vendored into `effect/unstable/reactivity` — a real risk of two Atom implementations in one bundle, with confusing failure modes. Version-couples the console to a 0.x package tracking a beta.

### Option C — React + Vite; plain React state, with a thin Effect runtime bridge for calls
- **Description:** `useState`/`useReducer` for view state; a small helper runs an Effect and returns its result.
- **Pros:** Smallest possible surface; every React developer already knows it; no reactive-layer decision at all.
- **Cons:** Client state stops being Effect-shaped, so retries, cancellation, and structured concurrency become bespoke per call site — the exact bespoke-fetch-logic the exploration set out to avoid. Cheap now, and the thing most likely to be rewritten when streaming lands.

### Option D — A framework with routing and data-fetching (TanStack Router/Query, Next)
- **Description:** Adopt a full client framework.
- **Pros:** Routing, caching, and devtools out of the box.
- **Cons:** Duplicates what Effect already provides on the data layer, and imposes its own async model beside Effect's. The exploration rejected this explicitly: "State layer: Effect, not a routing framework."

## Evaluation criteria
1. Version safety against a beta we pin exactly
2. Fidelity to the shared-schema contract (I6) and Effect-shaped data flow
3. Dependency weight and bundle risk
4. Cost to build now
5. Cost to change when streaming (TDR-003) and view-state persistence (TDR-012) land

## Analysis
- **Criterion 1 is decisive between A and B.** We pin `effect` to an exact beta and every package in the workspace resolves that one copy. Option B introduces a second Atom implementation from a 0.x package tracking that beta independently; when they diverge, the failure is a subtle identity mismatch inside a reactive graph, which is a poor thing to debug in a UI. Option A's state layer is the same module the rest of the workspace already loads.
- **Criterion 2 rules out D** and weakens C. The value the exploration identified is one schema contract end to end; D brings a competing async model, and C leaves each call site to reinvent retry and cancellation.
- **Criterion 4 favors C**, and it is the honest counterargument: for four read-mostly screens, plain React state would work today. Criterion 5 is what defeats it — streaming and server-backed view state both want a reactive layer that Effect already understands, and retrofitting one after screens exist is more work than starting with it.
- Option A's real cost is the hand-written binding. `useSyncExternalStore` against an `AtomRegistry` subscription is a small, well-understood shape, and it is the piece most easily discarded if the ecosystem binding stabilises.

## Recommendation
- **Option A.** React + Vite in `apps/console`; client state in `effect/unstable/reactivity` atoms; a small in-repo `useAtom` over `useSyncExternalStore`; no routing framework, and no router at all until deep-linking is actually wanted.
- The console decodes every response with `@viokit/schema` (I6) and reaches the engine only through the HTTP surface (I8).
- **View state is deliberately ephemeral.** Nothing is persisted — no saved layout, no restored selection — because I12 requires view state to be schema-encoded, versioned, per (user, investigation), and server-backed, which is TDR-012's decision. This slice therefore does **not** meet P3's I12 exit criterion, and says so rather than half-satisfying it in `localStorage`.
- **What would change this decision:** `@effect-atom/atom-react` targeting the in-`effect` reactivity module directly; Effect publishing first-party React bindings; or deep-linking becoming a requirement, which would reopen the routing question (a hash router, per the exploration's lean).

## Open questions
- Whether the console is served by the TDR-017 process in production-ish use or only by Vite in development. Not blocking — it changes no contract.

## References
- `openspec/exploration/04-web-ui.md` §1, §3
- `effect/unstable/reactivity` (`Atom`, `AtomRegistry`, `AsyncResult`, `Hydration`)
- TDR-017 (the HTTP surface); TDR-012 (view-state persistence, `proposed`)
