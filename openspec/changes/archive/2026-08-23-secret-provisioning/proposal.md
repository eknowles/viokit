# Secret Provisioning

## Why

Credential-gated sources are unusable, and worse than unusable in one respect: `SourceAuth` holds literal `apiKey`/`token` strings on the `SourceSpec`, and packs are now tracked source. The first person to test a real key commits it.

Two things are missing behind that. **Nothing applies auth** — neither `SourceRuntime` nor the HTTP transport reads `source.auth`, so authentication is decorative even when filled in. And **runnability lies**: a `requires_key` source reports runnable as soon as the spec carries an auth object, whether or not a usable credential exists anywhere.

Four curated sources are `requires_key` today and every commercial API added later will be. TDR-018 settles the shape: a reference resolved at acquisition, never a literal.

## What Changes

- **`SourceAuth` carries a reference, not a secret.** It names the secret (`secretRef`), how to apply it (`scheme`: bearer, header, or query), and where (`name`). The literal fields are removed, so committing a secret becomes unrepresentable rather than merely discouraged.
- **A `SecretProvider` seam** resolving references, with an environment-variable backend and a gitignored local file behind the same seam.
- **The runtime resolves and the transport applies.** Credentials are resolved inside `SourceRuntime` and handed to the transport as an already-authorised request, so no transform or front-end ever holds one (I4/I10).
- **Runnability tightens** — a credential-gated source is runnable only when its reference actually resolves, so the catalog stops promising a source whose key is absent.
- **Secrets stay out of the trail.** They do not enter the request fingerprint (already true, and now tested), the evidence record, the step log, or error messages — failures name the reference.

Not in this change: OS keychain and encrypted-file backends (deferred behind the seam per TDR-018), and key rotation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `core-schema`: source auth becomes a secret reference with an application scheme; literals are no longer expressible.
- `source-runtime`: credentials are resolved by the runtime and applied to the outbound request; an unresolvable reference makes the source not runnable, with that reason.
- `evidence-store`: evidence records never carry the credential an acquisition used.

## Impact

- `packages/schema`: `SourceAuth` reshaped; a `SecretProvider` seam and a `SecretNotFound` error; runnability derivation takes resolution into account.
- `packages/engine`: an environment-variable secret provider with a file-backed alternative; resolution in the acquisition pipeline before transport.
- `packages/sources`: the HTTP transport applies a resolved credential per the declared scheme.
- **Breaking**: `SourceAuth.apiKey`/`token` are removed. Nothing reads them today and no pack sets one, so the blast radius is a test fixture — but a spec carrying literals will now fail to decode, which is the point.
- Tests: resolution and refusal per scheme, an unresolvable reference reported as not runnable, the credential present on the outbound request, and absent from the fingerprint, the evidence record, and the failure message.
