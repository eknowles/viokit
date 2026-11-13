---
name: viokit-build
description: "Use whenever working on the Viokit investigation framework — core (ontology, sources, evidence, transforms, graph, interfaces), domain packs, technology decisions, or the web UI. Enforces the Viokit guardrails: the invariant contract (I1-I12), the spike-before-adopt rule for new dependencies, the open-domain rule, and the build-order gates in ROADMAP. Do not build Viokit components without following this skill."
---

# Viokit — Framework Build Guardrails

Expert guidance for building **Viokit**, the Effect v4 OSINT investigation engine: a Maltego-class
system with a 4D (spatiotemporal) ontology, immutable evidence, transform archetypes, an open
plugin/domain-pack model, cache + egress policy, and schema-driven UI.

## When to use

- Any code or design work on Viokit core, packs, sources, transforms, graph, evidence, UI, or deployment.
- Any technology choice for Viokit (runtime, stores, libraries, transport, serialization).
- Any work adding a domain pack, source, or transform.

## Non-negotiable guardrails

1. **Spike before you adopt.** A change that adds a dependency, transport, store, or serialization
   format MUST record a spike result in its `design.md` (a short, falsifiable experiment that ran, and
   what it showed) before the implementation tasks. There is no approval step: no human sign-off and no
   `decided` status. The spike is the gate. Past spikes contradicted the published docs more than once
   (browser proxy binding, `dataStore`, id strength, a GPL engine behind an MIT wrapper), which is why
   this stays. Decisions are written down afterwards as a decision record (see below).
2. **The invariant contract.** All work must preserve invariants **I1–I12** (see
   `references/CONTRACT.md`). Run the invariant checklist before every commit.
3. **Open-domain rule.** Core must never contain domain entity/relation types. Domain content ships
   as **packs**. New domain = new pack, following `references/PACK_RECIPE.md`.
4. **Build-order gates.** Follow `references/ROADMAP.md`. Do not start phase N+1 until phase N's
   checkpoints and exit criteria pass.
5. **Effect + schema-first.** Effect v4 everywhere; every boundary is Effect-Schema-encoded and
   validated (decode, never trust). Follow the `effect-ts` skill for all Effect code; follow
   `AGENTS.md` (ultracite) for style. The schema is shared across CLI, API, MCP, and UI.
6. **One pipeline, honest provenance.** Cache and egress are runtime policy stages in the source
   pipeline, never transform/UI logic; every acquisition records its path (`live`/`cache`/`proxy`).

## Workflows

### Adding a feature or component
1. Read the relevant exploration doc (`openspec/exploration/0X-*.md`).
2. If it adds a dependency, transport, store, or format, run and record the spike first.
3. Implement against the owning capability; never cross capability boundaries (see CONTRACT).
4. Add tests. Run: `tsc --noEmit`, `vitest run`, `npm exec -- ultracite check`.
5. Run the invariant checklist; update docs if behavior changed.

### Adding a domain pack
Follow `references/PACK_RECIPE.md`. It is the primary agent-facing workflow: types → sources →
transforms → view specs → tests, with the invariant checklist at the end.

### Recording a decision
Decision records (`openspec/decisions/TDR-NNN-<slug>.md`, from `TEMPLATE.md`) are a log, not a gate.
Write one after the work when the choice is non-obvious or the spike found something surprising. Put the
spike evidence and the findings in it, add it to `openspec/decisions/README.md`, and mark it
`superseded` if a later one replaces it. Nothing waits on a record being written or reviewed.

### Researching against the Effect skill
For any Effect API question, use `.agents/skills/effect-ts/` first (its setup requires
`.repos/effect`; run its setup task when building P0).

## Definition of done
- `npm exec -- ultracite check` clean
- `tsc --noEmit` clean
- tests pass (vitest + @effect/vitest)
- invariant checklist green (CONTRACT.md)
- any new dependency, transport, store, or format has its spike result in the change's `design.md`

## References
- `references/CONTRACT.md` — invariants I1–I12 + capability boundaries + forbidden crossings
- `references/ROADMAP.md` — build phases P0–P4 with gates and exit criteria
- `references/PACK_RECIPE.md` — the domain-pack creation workflow
- `openspec/exploration/01..04` — architecture, OSINT landscape, system design, web UI
- `openspec/decisions/` — decision records (a log, not a gate), template, and index
- `.agents/skills/effect-ts/` — Effect v4 patterns and guides
