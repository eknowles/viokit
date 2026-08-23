# Tasks — Secret Provisioning

> Prereq: TDR-018 `decided`. Breaking: `SourceAuth` literals are removed.

## 1. Schema

- [x] 1.1 Reshape `SourceAuth` to `{ secretRef, scheme, name? }` with `scheme` ∈ bearer | header | query; delete the literal fields.
- [x] 1.2 Add the `SecretProvider` seam and a `SecretNotFound` error carrying the reference.
- [x] 1.3 Boundary tests: a reference-carrying auth decodes; a spec carrying a literal credential is rejected (I6).

## 2. Providers

- [x] 2.1 Environment-variable provider, treating an empty value as absent.
- [x] 2.2 File-backed provider reading a JSON object from a gitignored path, behind the same seam.
- [x] 2.3 Tests: present, absent, and empty-value cases for both.

## 3. Resolution and runnability

- [x] 3.1 Give `runnabilityOf` a resolver predicate; a credential-gated source is runnable only when its reference resolves.
- [x] 3.2 Resolve in `SourceRuntime` before transport; fail with the reference named when resolution fails, attempting no request.
- [x] 3.3 The catalog passes the same provider, so its promise and acquisition agree.
- [x] 3.4 Tests: unresolvable → not runnable and no request attempted; resolvable → runnable and acquired.

## 4. Application

- [x] 4.1 Extend the transport seam to accept a resolved credential; the HTTP transport applies it per scheme.
- [x] 4.2 Tests: bearer, header, and query schemes each land on the outbound request.

## 5. Containment

- [x] 5.1 Test that the cache fingerprint is unchanged by the credential resolved.
- [x] 5.2 Test that stored evidence carries no credential value.
- [x] 5.3 Test that a resolution failure names the reference and contains no value.

## 6. Verification

- [x] 6.1 Typechecks and every suite green; `ultracite check` clean.
- [x] 6.2 Invariant checklist, with I4/I10, I6, and the secrets-out-of-cache/evidence rule called out.
