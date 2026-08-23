# Tasks — View-State Persistence

> Prereq: TDR-012 `decided`. Closes P3's outstanding I12 exit criterion.

## 1. Schema

- [x] 1.1 `ViewStateKey` (user, investigation, surface) and a `ViewStateDocument` envelope (key, version, opaque JSON payload).
- [x] 1.2 The `ViewStateStore` seam: load returning absence for missing, undecodable, or unrecognised-version documents; save.
- [x] 1.3 A typed error for a store that cannot be written.
- [x] 1.4 Boundary tests for the envelope (I6).

## 2. Store

- [x] 2.1 Filesystem backend: one file per key under a configured root, path derived by hash so key contents cannot escape or collide.
- [x] 2.2 Absence on a missing file; create the root on write.
- [x] 2.3 Tests: round-trip, key isolation, missing key, corrupt document, unrecognised version.

## 3. Engine and operations

- [x] 3.1 `Engine` gains load and save; the layer provides the store.
- [x] 3.2 `view_state_save` and `view_state_load` on the shared operation table.
- [x] 3.3 Tests: saving appends no step and writes no evidence; replay is byte-identical before and after (I3/I12); three-way parity still holds.

## 4. Console

- [x] 4.1 Restore on load, before the first commit, so there is no flash from defaults.
- [x] 4.2 Save on change, debounced, fire-and-forget — a failed save never interrupts.
- [x] 4.3 Unreadable stored state falls back to defaults and the console stays usable.
- [x] 4.4 Tests: the persisted payload round-trips through the client; a corrupt payload yields defaults.

## 5. Verification and close-out

- [x] 5.1 Typechecks, suites, and `ultracite check` clean.
- [x] 5.2 Drive it against a live API: change view, reload, land where you were.
- [x] 5.3 Remove P3's outstanding-I12 note from `ROADMAP.md` and the "reload starts over" line from the console README.
- [x] 5.4 Invariant checklist, with I12, I3, I6, and I8 called out.
