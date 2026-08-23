## Context

See `proposal.md` — Why, and TDR-012 for the decision. What shapes the implementation:

- The console holds three pieces of state today (current view, selected transform, the catalog's runnable filter) and will grow more with every surface. Whatever is built now is the shape everything later uses.
- `Engine` is a thin pass-through over injected services; adding a store follows the same pattern as evidence and graph.
- The operation table is how every front-end reaches the engine, so view state must arrive there rather than as a console-specific endpoint.
- **Neither users nor investigations exist.** The keys are placeholders (see TDR-012); the store must not care.

## Goals / Non-Goals

**Goals:**
- One store shape that every future surface uses without renegotiation.
- Configuration that cannot leak into the evidentiary record, structurally rather than by discipline.
- A surface that stays usable when its stored state is unreadable.

**Non-Goals:**
- No cross-device sync, no conflict resolution, no multi-writer story (TDR-012 defers all three).
- No migration *engine*. Documents carry a version and a version the surface does not recognise is discarded; writing transformers between versions is work for when there are versions to transform.
- No view state in evidentiary export.

## Decisions

1. **The payload is opaque to the store; the surface owns its shape.**
   A document is `{ key, version, payload }` where `payload` is arbitrary JSON. The alternative — a `ViewState` schema in core enumerating every surface's fields — would put UI configuration in the shared schema and make every new console field a change to `packages/schema`. Surfaces validate their own payloads on load; the store validates the envelope. This keeps core free of UI shape, which is the same open-domain reasoning that keeps entity types out of core.

2. **A version mismatch is treated as absence, not as an error.**
   Loading returns `None` for a missing key, an undecodable document, *or* a version the caller does not recognise. All three mean the same thing to a surface: start from defaults. Making them one outcome removes the branch where a surface handles "corrupt" differently from "new" and gets it wrong.

3. **The key is a triple, and all three parts are required even while two are constants.**
   `{ user, investigation, surface }`. Defaulting user and investigation inside the store would hide the placeholder; requiring them at the call site keeps it visible, and makes the day they stop being constants a change to callers rather than a change to the store.

4. **Storage is one file per key under a configured root.**
   Path is derived from the key with a hash, so a surface name or investigation id cannot escape the root or collide through path characters. A missing root directory is created on write; a missing file is absence on read.

5. **Save and load are ordinary operations on the shared table.**
   `view_state_save` and `view_state_load`, so all three front-ends get them and the parity test covers them. The console has no private channel to its own persistence.

6. **The console saves on change, debounced, and restores once on load.**
   Restoring happens before the first render commits so there is no visible flash from default to restored. Saving is fire-and-forget: a failed save logs and is otherwise ignored, because losing a layout preference must never interrupt an investigation.

## Risks / Trade-offs

- **[An opaque payload means the store cannot validate what surfaces write]** → **Mitigation**: deliberate (decision 1); the surface validates its own payload, and an invalid one degrades to defaults rather than breaking. The envelope — the part the store is responsible for — *is* validated.
- **[Two consoles on one key race, last-write-wins]** → **Mitigation**: accepted in TDR-012; the workload is one writer, and the seam is where a concurrency-capable backend goes when that changes.
- **[Placeholder keys could calcify]** — a single user and default investigation might quietly become an assumption → **Mitigation**: they are required parameters rather than defaults, so every call site names them and the day they become real is a compile error, not a silent wrong answer.
- **[Debounced saves can lose the last change on a hard close]** → **Mitigation**: acceptable for configuration; the debounce is short, and the alternative — a write per keystroke — is worse for a filesystem store.

## Migration Plan

Additive. No existing data, no existing keys. The console gains restore-on-load; a deployment with no store directory behaves exactly as it does today. Rollback is removing the store layer and the two operations.

## Open Questions

None blocking.
