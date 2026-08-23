## Context

See `proposal.md` — Why, and TDR-018 for the decision. Facts that shape the implementation:

- `SourceAuth` is `{ apiKey?: string, token?: string }` on `SourceSpec`, and **no code reads it**. Removing the literals breaks one test fixture and nothing else.
- `requestFingerprint` (`packages/engine/src/cache.ts`) already hashes only `id`, `transport`, and `url` — credentials are structurally excluded from cache identity, and the change must keep it that way.
- `runnabilityOf` currently treats `requires_key` as runnable when `source.auth !== undefined`. That is the check that has to become "the reference resolves".
- The transport seam is `fetch: (source) => Effect<TransportResult, SourceError>` — it receives the whole `SourceSpec` and builds the request itself, so applying a credential means either handing the transport the resolved value or having it resolve. Only one of those keeps credentials runtime-owned.

## Goals / Non-Goals

**Goals:**
- Make a committed credential unrepresentable, not merely discouraged.
- Resolve inside the runtime; the transport applies what it is given and cannot reach the provider.
- A source's runnability tells the truth about whether its credential exists here.

**Non-Goals:**
- No keychain or encrypted-file backend (TDR-018 defers both behind the seam).
- No rotation, no expiry, no refresh flows.
- No per-identity credential selection; that is TDR-011's identity model, not this.

## Decisions

1. **`SourceAuth` becomes `{ secretRef, scheme, name? }` and the literals are deleted.**
   `scheme` is `bearer` | `header` | `query`; `name` supplies the header or parameter name where the scheme needs one. Alternative considered: keeping the literals and adding references beside them (rejected — a field that *can* hold a secret eventually will, and the whole value of the change is making that impossible).

2. **Resolution happens in `SourceRuntime`, and the transport receives a resolved credential.**
   The transport seam gains an optional resolved-credential argument rather than the `SecretProvider` itself. Handing transports the provider would let any transport resolve any secret, and transports are the component most likely to be contributed by a pack later. Alternative considered: resolving in the transport (rejected on I4/I10 — credential handling is runtime policy).

3. **Runnability calls the provider.**
   `runnabilityOf` currently answers from the spec alone, which is why it is pure and shared by the catalog and the runtime. Resolution makes the answer environment-dependent, so the function takes a *resolver predicate* — "does this reference resolve here?" — supplied by the caller. The catalog and the runtime pass the same provider, so the catalog's promise and acquisition's behaviour continue to agree.

4. **A reference that resolves to an empty value is treated as absent.**
   An exported-but-empty environment variable is the most common way a credential is "set" without being usable, and reporting the source as runnable in that state would be a lie of exactly the kind this change exists to remove.

5. **Failures name the reference and are constructed from it, never from the value.**
   `SecretNotFound` carries the reference. The runtime never interpolates a resolved value into a message, so no failure path can leak one — the type makes the safe thing the only available thing.

6. **The environment backend is the default; a gitignored file backs it up.**
   `SecretProviderEnv` reads `process.env`; `SecretProviderFile` reads a JSON object from a path (defaulting under `.viokit/`, already gitignored). Both satisfy one seam, so a deployment picks a layer.

## Risks / Trade-offs

- **[Removing the literal fields is a breaking schema change]** → **Mitigation**: nothing reads them and no pack sets one; the only in-repo user is a test fixture. A spec carrying literals now fails to decode, which is the intended outcome rather than a regression.
- **[Runnability stops being a pure function of the spec]** — the same spec is runnable in one shell and not another → **Mitigation**: that is the truth being reported, and it is exactly why the catalog computes it per deployment rather than storing it (the same reasoning as the browser-transport case).
- **[Environment variables are readable by the whole process]** → **Mitigation**: accepted in TDR-018; the threat addressed here is credentials in version control, and the seam leaves a keychain backend available when process-level exposure starts to matter.
- **[A resolved credential passes through the transport boundary in memory]** → **Mitigation**: unavoidable — something must put it on the wire. It is confined to the acquisition call, never stored, and never returned to a caller.

## Migration Plan

Additive except the `SourceAuth` reshape. No pack sets auth, so no pack changes. Existing specs without auth are unaffected — `auth` remains optional, and a source without it behaves exactly as before. Rollback is restoring the literal fields.

## Open Questions

None blocking.
