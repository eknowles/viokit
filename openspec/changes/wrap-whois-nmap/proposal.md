## Why

`dig` is the only command-line tool wrapped so far, so the investigation tree has almost nothing to expand through. `whois` (a registry record for a domain) and `nmap` (open ports and services on an address) are the next two most useful, both are already in the sidecar, and between them they produce five entity kinds and five relation types from the shared vocabulary. They also prove that tools written separately meet on the same graph nodes.

*Written after the work.* This change was built before it was documented, which skips the project's usual order. The spike results below are what was actually run and observed.

## What Changes

- Add a passive `whois` source and a `whois-registration` transform, and an active `nmap` source and an `nmap-open-ports` transform, to the `web-dns` pack.
- Add the shared projection helpers in one file, and one file per tool for its projection, so tools do not share a file.
- Add `netbase` to the sidecar image, which `whois` needs.
- Extend the vocabulary check so entity kinds passed to the pack's helper functions are checked, not only literal `kind:` fields.
- Replace three hard-coded count assertions with counts derived from the manifests, so adding a tool does not mean editing an existing test.
- Fix a flaky relatedness ordering that failed about half the runs on a clean `main`.
- Add real captured output as test fixtures, and opt-in end-to-end tests against the live sidecar.

Out of scope: more tools, parsing other whois formats beyond the few keys that mean the same across registries, and raw-socket scans.

## Capabilities

### New Capabilities
- `web-dns-tools`: the whois and nmap sources and their projections into the shared vocabulary.

### Modified Capabilities

## Impact

- `packages/packs/web-dns/`: new `graph.ts`, `whois.ts`, `nmap.ts`; `sources.ts`, `manifest.ts`.
- `sidecar/Dockerfile`; `conformance/vocabulary.ts` and its tests.
- `packages/engine/src/graph-duckdb.ts`: one ORDER BY. Three existing tests change; two new test files and fixtures.
- No new dependency.
