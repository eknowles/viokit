## Context

`Entity.kind` and `Relation.type` are plain strings (`packages/schema/src/schemas.ts`). The `web-dns` pack uses the entity kinds `domain` and `ip-address` and the relations `alias-of`, `delegated-to`, `has-subdomain` and `resolves-to`. The open-domain rule forbids domain types in core, so enforcement cannot live in the engine. See `proposal.md`.

## Goals / Non-Goals

**Goals:** one list agents can read; a mechanical check that fails invention; a single lane that may change the list.

**Non-Goals:** attribute schemas per kind, fuzzy matching, enforcing at runtime.

## Spike

Run 2026-11-13. Findings from reading the code and the external vocabularies.

| Question | Result |
|---|---|
| What names are in use today? | Entity kinds `domain`, `ip-address`; relations `alias-of`, `delegated-to`, `has-subdomain`, `resolves-to`. The grep also matches `kind: "passive"`, which is an exec source's tool classification, not an entity kind, so the check must exclude it. |
| Is SpiderFoot's list reusable? | Its licence is MIT (the file headers say "Licence: MIT", copyright Steve Micallef). `eventDetails` has about 172 entries in one flat list, mixing entities, descriptors, data and internal events, so it is a model, not a drop-in. Names are taken as inspiration with attribution; the file is not copied. |
| Is BBOT's list reusable? | Its repository is AGPL-3.0. The 33 event-type names are plain facts, but no BBOT code is copied or adapted. |
| Can a regex find the names? | Entities and identifiers are built with `kind: "…"` and relations with `linked(a, b, "…")`. Both are literal strings, so a line scan finds them. It misses names built dynamically; the design lists that as a limit. |

## Decisions

### 1. The vocabulary is its own package, not core and not a pack
`packages/vocabulary/` exports typed constants. It is outside core, which respects the open-domain rule. It is not under `packages/packs/` because the pack-conformance test requires every directory there to be a registered pack with a manifest, and a vocabulary has no sources or transforms.

### 2. Ten kinds, thirteen relations
Kinds: `domain` (any DNS name, as SpiderFoot's internet name), `ip-address`, `netblock`, `asn`, `certificate`, `open-port`, `technology`, `organization`, `email-address`, `url`. Relations: the four existing ones plus `serves-mail-for`, `issued-for`, `owned-by`, `announced-by`, `within`, `hosts`, `runs`, `contact-for`, `links-to`. One `domain` kind covers hostnames, subdomains and name servers; the relation carries the role, which avoids the `domain`/`hostname`/`fqdn` split.

### 3. Enforcement is a held-out check, not a schema
A line scan over `packages/packs/*` (excluding the vocabulary package, tests and `node_modules`) for `kind: "…"` and `linked(…, "…")`. `passive` and `active` are ignored as exec classifications. It lives with the other conformance checks and runs in `bun run conformance`.

### 4. A steward flag on the guard
The guard adds the vocabulary directory to its protected set. `--steward` lifts only that directory's protection, never the conformance rules or specs. The orchestrator passes it for a change whose name starts with `vocabulary-`. An author cannot pass it for their own change because the orchestrator, not the author, runs the guard.

## Risks / Trade-offs

- **Dynamic names evade the scan** → listed as a limit; entity creation helpers can be added later so literals are the only path.
- **The steward lane is a bottleneck** → deliberate; a tool agent that needs a new kind proposes it and keeps working against a stub.
- **The vocabulary will be wrong for tools not yet seen** → it is the first ten kinds, and growing it is a normal, reviewed change.
