# TDR-018 — Secret provisioning for credential-gated sources

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** TDR-006 (cache backends — same seam-then-filesystem pattern), TDR-007 (evidence store, same), TDR-011 (egress/identity); invariants I1, I4/I10, I9; `CONTRACT.md` "Secrets must not enter the cache or evidence"

## Decision summary
> A `SecretProvider` seam resolving named references at acquisition time, with an environment-variable backend first and a gitignored local file behind the same seam; `SourceAuth` carries a *reference and a scheme*, never a literal, so a secret cannot be written into a pack. OS keychain and encrypted-file backends are deferred behind the seam.

## Context
- Four curated sources are classified `requires_key`, and every commercial API added later will be. They are currently unusable: `runnabilityOf` refuses them unless the spec carries auth, and even when it does, **nothing applies it** — neither `SourceRuntime` nor the HTTP transport reads `source.auth`. Authentication is decorative today.
- `SourceAuth` is `{ apiKey?, token? }`, i.e. literal strings on the spec. Packs are tracked source (see `monorepo-sections`), so a literal is a secret in version control the moment anyone fills one in.
- Constraints: secrets must not enter the cache, evidence, the step log, or error messages (`CONTRACT.md`); policy stays runtime-owned (I4/I10) so a transform or front-end never handles a credential; cache fingerprints already exclude auth, which must stay true.
- Affects `packages/schema` (the auth shape), `packages/engine` (resolution and refusal), `packages/sources` (application), and pack authoring.

## Options considered

### Option A — `SecretProvider` seam; environment variables first, local file behind the same seam
- **Description:** `SourceAuth` names a secret (`secretRef`) and how to apply it (`scheme`, `name`). At acquisition the runtime resolves the reference through a `SecretProvider` and hands the transport a ready request; unresolved references make the source not runnable, with that reason.
- **Pros:** Secrets never appear in a spec, so they cannot be committed. Environment variables work identically in a shell, a launcher, and CI, with no format to invent. The seam means the backend is a swap, not a rewrite — the same shape TDR-006 and TDR-007 already established. Resolution at acquisition keeps credentials inside the runtime (I4/I10).
- **Cons:** Environment variables are visible to the whole process and to anything that can read `/proc`; they are a weak boundary against a hostile local process, though not against version control, which is the threat here.

### Option B — OS keychain (Keychain Access, libsecret, DPAPI)
- **Description:** Resolve secrets from the platform credential store.
- **Pros:** The strongest local protection; encrypted at rest, access-controlled by the OS; no plaintext anywhere.
- **Cons:** Three platform implementations plus a native dependency, for a tool whose first deployment is one developer's laptop. Headless and CI use needs an env fallback anyway, so it does not remove Option A — it adds to it. Better as a second backend once the seam exists.

### Option C — Encrypted file (age/sops) committed alongside the packs
- **Description:** An encrypted secrets file in the repo, decrypted at startup.
- **Pros:** Secrets travel with the project; good for a team sharing a deployment.
- **Cons:** Adds an encryption dependency and a key-distribution problem to solve before a single source authenticates. Solves sharing, which is not yet a requirement.

### Option D — Literal secrets on the `SourceSpec` (status quo)
- **Description:** Fill in `apiKey`/`token` and keep them out of git by discipline.
- **Pros:** Nothing to build.
- **Cons:** Packs are tracked source; the first person to test a key commits it. Discipline is not a control, and `git` does not forget. Rejected.

## Evaluation criteria
1. Makes committing a secret impossible, not merely discouraged
2. Keeps credentials inside the runtime (I4/I10) and out of cache, evidence, and logs
3. Works headless and in CI without a second mechanism
4. Dependency and platform cost now
5. Leaves stronger backends available later

## Analysis
- **Criterion 1 eliminates D and is what makes the schema change worth its churn.** If `SourceAuth` can hold a literal, someone will eventually put one there; if it can only hold a reference, the mistake is unrepresentable. That is worth breaking a field nothing currently reads.
- **Criteria 3 and 4 decide between A and B.** B is genuinely more secure at rest, but needs three platform backends and a native dependency, and still needs an environment fallback for CI — so it is strictly additive to A rather than an alternative. Doing A first and B behind the same seam is the same sequencing TDR-006 and TDR-007 chose, and for the same reason.
- **C solves a sharing problem we do not have**, at the cost of key distribution we would have to solve first.
- **Criterion 2 is a property of the design rather than the backend**: resolution happens inside `SourceRuntime`, the transport receives an already-authorised request, cache fingerprints already exclude auth, and failures name the *reference* rather than the value. Whatever backend resolves the secret, none of that changes.
- A's honest weakness is that an environment variable is readable by anything in the process. Against the threat this decision addresses — credentials in version control — it is sufficient; against a hostile local process it is not, which is what B is for.

## Recommendation
- **Option A.** A `SecretProvider` seam; `SourceAuth` carries `secretRef`, `scheme` (`bearer` / `header` / `query`), and an optional `name`; literals are removed from the schema. Environment-variable backend by default, with a gitignored local file behind the same seam for convenience.
- A `requires_key` source is **runnable only when its reference actually resolves**, so the catalog stops promising a source whose key is absent.
- Secrets are resolved inside `SourceRuntime` and applied by the transport; they never enter the fingerprint, the evidence record, the step log, or an error message — failures name the reference.
- **What would change this decision:** a shared or multi-user deployment (which makes C's key distribution worth solving), or handling credentials valuable enough that process-level exposure matters (which promotes B from "later" to "now").

## Open questions
- Whether key *rotation* — which `SourceSpec` mentions as a policy — becomes a provider concern or stays a retry concern. Not blocking: nothing rotates yet.

## References
- `CONTRACT.md` — secrets must not enter cache or evidence; I4/I10 policy isolation
- TDR-006, TDR-007 — the seam-then-filesystem precedent
- `packages/engine/src/cache.ts` — `requestFingerprint` already excludes auth
