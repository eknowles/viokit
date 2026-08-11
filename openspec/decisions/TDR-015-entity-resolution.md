# TDR-015 — Entity resolution / dedup (correlate)

- **Status:** decided
- **Owner:** core
- **Date:** 2026-08-11
- **Related:** TDR-005 (graph store — DuckDB); ROADMAP P2; CONTRACT I2/I3/I6/I7; `openspec/exploration/03-system-architecture.md` §2 (graph, relatedness, replay); `openspec/exploration/01-architecture-exploration.md` (property graph w/ temporal edges, account-linking)

## Decision summary
> Scope and place of the `correlate` transform: **app-level, schema-driven identity resolution over identifiers, running after ingest, emitting new `Step`s** — not a store-level merge, and not an in-place graph mutation. Only *explicit* identity signals (shared identifiers, verified same-kind identifiers) promote a candidate; all resolution is recorded as provenance-bearing steps (I2/I3), never as a silent rewrite of existing vertices. **Identifiers are normalized to canonical forms before matching** (strict, deterministic) — this is what makes "1 Main St" and "1 main street" resolve without falling back to probabilistic fuzzy matching, which stays deferred to P4.

## Context
- P2's `correlate` archetype must **dedup/resolve entities**: two source records (e.g. an email in a whois, an email in a breach) that are actually the same real-world entity should collapse into one investigation vertex — without losing provenance (I2) or the ability to replay (I3).
- Constraints: the graph is a **replay projection** over an append-only step log (TDR-005/DuckDB). Therefore resolution **cannot mutate the materialized graph in place** — the projection is recomputed from the log, so resolution must be expressed as *new steps*, or the deterministic replay (I3/I11) is broken. Schema-first (I6): match rules and identifiers are schema-encoded. Attribution to evidence (I2): every resolution step cites the evidence that justified it. Source versioning (I7) is preserved through the originating source refs.
- The open-domain rule applies: core defines the *mechanism* (identifier equality, schema-encoded match), never domain-specific rules (e.g. "email equals email for people") — those live in packs.
- This decision sets WHERE resolution runs (engine orchestrator after a transform's steps are staged) and the POLICY basis (which signals may merge, and on what confidence).

## Options considered

### Option A — App-level resolution transform, emit new Steps (chosen)
- **Description:** `correlate` is a transform archetype in the engine. Given staged (uncommitted) output steps + existing graph, it checks identifier overlap against existing vertices using schema-encoded match rules. Matches emit a `ResolveEntity` step (supersede/merge), written append-only with evidence attribution.
- **Pros:** preserves I3 (everything is a step; replay reproduces merge history); preserves I2 (every resolution cites evidence); schema-driven so packs add rules without touching core (open-domain); confidence is an explicit, auditable field; plays naturally with `relatedness` (shared identifiers feed ranking).
- **Cons:** engine does per-candidate matching (needs an index over identifiers — DuckDB table/`relatedness` reuse); merge is not "automatic" — requires the runner to be invoked; matching policy must be defined carefully to avoid over-merge.

### Option B — Store-level merge/rewrite
- **Description:** on insert, the graph store silently redirects duplicate identifiers to an existing canonical vertex (in-place rewrite of the materialized projection).
- **Pros:** less engine code; dedup "just happens" at write.
- **Cons:** **violates I3/I11** — an in-place rewrite of the projection is not a fold over the append-only log, so replay cannot reproduce it; silently loses the "these two were distinct until evidence X" fact, which is core to an evidentiary OSINT tool; hard to attribute a merge to evidence (I2). Rejected on invariant grounds.

### Option C — Confidence-scored probabilistic matching (fuzzy)
- **Description:** resolve on fuzzy similarity (Levenshtein/embedding) of names, not just exact identifier equality.
- **Pros:** catches typos/synonyms a strict matcher misses.
- **Cons:** **high false-merge risk on unverified/leaked OSINT data** — the exact failure mode P4's veracity model warns about (leaked data may share artifacts coincidentally). Fuzzy merging that is wrong is far worse than failing to merge. Should be deferred to P4's confidence/veracity model, not baked into P2's deterministic mechanism.
- **Deferred:** this is a policy addition later, not the core mechanism. Note that **canonical normalization** (chosen in A) removes much of the realistic "close but not exact" variation (case, whitespace, punctuation, street suffixes) deterministically, shrinking the residual gap fuzzy matching would otherwise cover.

### Option D — Do resolution only at query/report time (no materialization)
- **Description:** never merge in the store; compute "these are the same" as a derived view when querying/reporting.
- **Pros:** zero risk to the log; maximum provenance.
- **Cons:** every query/report repeats resolution work; `relatedness` and graph traversal see unmerged duplicates unless every path goes through a resolution layer; complicates the 4D graph surfaces. Not suitable as the primary mechanism (could be a *report-time* complement later).

## Evaluation criteria
1. Preservation of append-only replay (I3/I11) — a resolution mechanism must not break deterministic fold
2. Provenance closure (I2) — resolution attributable to evidence
3. Schema-first + open-domain fit (I6) — mechanism in core, rules in packs
4. Correctness/risk on unverified OSINT data (avoid false merges)
5. Fit with the DuckDB replay-projection graph store (TDR-005)
6. Effort to integrate with the transform framework (Workstream 1)

## Analysis
- **I3/I11 (1) is decisive.** Option B breaks it outright. A/B is only viable if resolution is expressed as steps. → Options A or D.
- **Provenance (2):** A attributes merges to evidence via steps; D does too but defers all work to read time.
- **Correctness (3/4):** A with *strict, explicit identity signals* (normalized shared identifiers, verified same-kind) is the safe baseline. **Normalization is the deterministic bridge for realistic variation**: instead of falling to probabilistic fuzzy matching, the matcher compares *canonical forms* — lowercase, trimmed, punctuation-stripped, and pack-supplied equivalences (e.g. road suffixes) — so "1 Main St" == "1 main street" is an *exact* match on normed values. This keeps resolution deterministic and replay-safe (I3) while answering the "nothing is truly exact" concern. Fuzzy matching (C) remains deferred to P4 veracity.
- **Fit (5):** A reuses the DuckDB projection — an identifier index and `relatedness` share the same columnar tables; D adds a resolution layer over every query. → A is the cleaner fit.
- **Trade-off:** A costs some engine code (normalizer + identifier index + match + merge-step emission) and a careful policy, in exchange for a deterministic, attributable, replay-safe resolution. That is the correct trade for an evidentiary tool.

## Recommendation
- **Chosen:** **Option A — app-level `correlate` transform emitting new `ResolveEntity` steps** (append-only, evidence-attributed), matching on **normalized explicit identifier signals** via schema-encoded rules contributed by packs. **Identifier normalization is part of the core mechanism (not optional):** `correlate` applies a `NormalizationRule` per identifier-kind before equality checks, so canonical-form equality IS the strict match — deterministic and replay-safe (I3), and no fuzzy dependency. Runs in the engine orchestrator on staged transform output before commit to the graph. Fuzzy/confidence-scored matching (Option C) is deferred to P4's veracity model. Store-level rewrite (B) is rejected as an I3/I11 violation.
- **What would change this decision:** a hard requirement for automatic, silent dedup at write time (then we'd have to redesign the replay model, not just the resolver); or P4 evidence that fuzzy merging is safe on real leaked-data distributions (then extend the matcher, still behind steps).

## Open questions
- (Resolved in implementation, 2026-08-11) Schema for `ResolveEntity` step + `MatchRule` + `NormalizationRule`: `ResolveEntity` carries `canonicalId` + `mergeId` + `basis` (matched normalized identifier kinds/values) + `confidence`. `NormalizationRule` maps an identifier-kind to a deterministic normalizer (built-ins: `trim`, `lower`, `stripPunctuation`, `collapseWhitespace`; packs may compose/replace). Packs register rules via the seam. Exact match is compared on normalized values (I3-safe).
- (Resolve in implementation) Identifier index over the DuckDB projection for O(1) candidate lookup (reuse/extend the identifier columnar materialization).

## References
- `openspec/decisions/README.md` TDR-015 row; TDR-005 (DuckDB graph store); `ROADMAP.md` P2; CONTRACT I2/I3/I6/I7/I11; `STAGED_BUILD.md` anti-rework lever; `openspec/exploration/01-architecture-exploration.md` (account-linking, entity resolution).
