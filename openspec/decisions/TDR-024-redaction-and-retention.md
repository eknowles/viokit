# TDR-024 — Redaction and retention over an immutable record

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** TDR-010/TDR-021 (the export this protects), TDR-025 (investigations — the unit a policy applies to), TDR-023 (identity — a redaction needs an actor), TDR-018 (secrets, which are already kept out); invariants **I1** (evidence write-once, id *is* the digest), **I3** (append-only history), I2 (provenance closure), I9 (acquisition transparency); `CONTRACT.md` capability `governance` — "must not leak sensitive data to cache/export"

## Decision summary
> **A redaction is an append-only record, never a mutation.** Withheld material is *named* in an export rather than silently omitted, because a bundle that quietly drops evidence is worse than one that says what it is withholding. Retention marks material expired by the same mechanism; **destruction is separate, opt-in, and leaves a tombstone**, since a gap nobody can explain is worse than a gap that explains itself.

## Context

The roadmap's own words: sensitive *content* does not stay out of an export, and this is "needed before
a bundle leaves a machine". The export is this project's flagship artifact — scoped to a case
(TDR-025), carrying custody (TDR-023), verifiable by a recipient who runs none of our software
(TDR-010/021). It is also, right now, all-or-nothing: everything the case cites goes.

That is the gap. An investigator cannot hand over a case that contains one thing they must not
disclose — a source's identity, a bystander's details, material a court excluded — without handing
over that thing too.

**The hard part is the collision with this system's own foundations.** Evidence is write-once and its
id *is* the SHA-256 of its bytes (I1); the step log is append-only and replay is a fold over it (I3).
So:

- You cannot edit an artifact to remove a name. Changing bytes changes identity.
- You cannot delete a step to un-say something. Replay would no longer reproduce the state, and every
  claim downstream of it loses its provenance (I2).
- Evidence is shared across investigations (TDR-025), so an artifact one case wants gone may be cited
  by another that has every right to it.

Constraints:
- **I1 and I3 are not negotiable.** A redaction mechanism that mutates or deletes history would
  dismantle the thing that makes the tool worth using.
- A redaction must itself be attributable — who withheld this, when, and why — which TDR-023 now makes
  possible.
- **Retention and redaction are different problems.** Redaction is "this must not leave"; retention is
  "this must not be kept". The second sometimes really does mean destruction, and law may require it.
- Cache and evidence must both be covered, or the material is still on the machine.

Affects `packages/schema` (a redaction record), `packages/engine` (export, evidence reads),
`packages/agent` (operations), and eventually the console.

## Options considered

### Option A — Redact at export only, from a policy
- **Description:** Export takes a set of rules (artifact ids, patterns); matching material is left out
  of the bundle. Nothing is recorded in the system.
- **Pros:** Trivial. Nothing stored changes, so no invariant is touched.
- **Cons:** The decision to withhold is invisible and unrepeatable — two exports of the same case can
  differ with nothing to explain why, which is exactly the property an evidentiary bundle must not
  have. And nobody can answer "who decided this was sensitive".

### Option B — A redaction is an append-only record; export honours and declares it
- **Description:** Redacting appends a record — artifact, investigation, reason, principal, time.
  Evidence and the log are untouched. Export omits the bytes and **names what it withheld** in the
  manifest. Reads of a redacted artifact refuse rather than return.
- **Pros:** Consistent with everything here: history stays append-only (I3), evidence stays immutable
  (I1), and the redaction is itself attributable and reviewable. A recipient can see *that* something
  was withheld and ask about it — the bundle stays honest. Repeatable: the same case exports the same
  way, and the reason travels.
- **Cons:** The bytes are still on the machine. That is right for redaction and *insufficient for
  retention*, so this option must be paired with a destruction story rather than pretending to be one.

### Option C — Crypto-shredding: encrypt every artifact, discard the key to "delete"
- **Description:** Artifacts stored encrypted per key; destroying the key destroys access.
- **Pros:** Real destruction without touching the store's shape; well-trodden in regulated systems.
- **Cons:** The id is the digest of the *plaintext* (I1/TDR-021), so either the id stops verifying
  against what is stored — breaking the property a recipient uses — or the plaintext digest is
  retained and the artifact is still identifiable. It also introduces key management as a hard
  dependency of reading anything, which is a large new failure surface for a local-first tool.

### Option D — Physical deletion with a tombstone
- **Description:** Destroy the bytes; leave an append-only record that they existed and were
  destroyed, by whom and why. Steps that cite the artifact keep citing it; reads return a gap that
  explains itself.
- **Pros:** The only option that actually satisfies "must not be kept". Keeps I3 intact — nothing is
  removed from history, and the destruction is *added* to it. A trail that says "this was destroyed on
  this date under this policy" is stronger than one with an unexplained hole.
- **Cons:** Irreversible, so it must be deliberate and hard to do by accident. Shared evidence makes it
  worse: destroying an artifact one case is done with can gut another case that still cites it. I2 is
  strained — a claim's evidence can no longer be produced, though it can still be *named*.

### Option E — Redaction as a graph-level mask
- **Description:** Mark entities or relations sensitive; hide them from views and exports.
- **Pros:** Closer to how an investigator thinks — "this person must not appear".
- **Cons:** The derived claim is masked while the evidence it came from still exports, so the material
  leaves anyway. It is a presentation feature wearing a governance costume. Worth having *later*, over
  a real mechanism, not instead of one.

## Evaluation criteria
1. Does it preserve I1 and I3? — non-negotiable
2. Is the decision to withhold attributable and repeatable?
3. Does a recipient learn that something was withheld, rather than being quietly handed less?
4. Does it actually satisfy "must not be kept", where that is required?
5. What happens to an artifact two investigations both cite?
6. Blast radius of a mistake

## Analysis

- **Criterion 1 eliminates C** on this system's specific terms: the evidence id is the digest of the
  plaintext, and that identity is the thing a recipient verifies with `shasum`. Encrypting underneath
  it either breaks that or fails to hide anything.
- **Criterion 3 is where A fails and it is not a small failure.** An export that silently contains less
  than the case does is a misleading document. This project's entire claim is that the artifact can be
  trusted; withholding without saying so forfeits it. B and D both declare.
- **Criteria 2 and 6 favour B strongly.** A redaction that is a record can be reviewed, questioned, and
  — because nothing was destroyed — reversed if it was wrong. A mistake costs an argument, not an
  investigation.
- **Criterion 4 is the one B cannot meet.** "Do not disclose" and "do not retain" are different
  obligations, and only D discharges the second. That is why this decision needs both: **B is the
  mechanism, D is the escalation**, and they share one record type — a redaction that has also been
  destroyed is the same fact with a stronger consequence.
- **Criterion 5 is the sharp edge of D.** Evidence is content-addressed and shared, so destruction is
  not a per-case act even when the request is. The honest answer is that destroying an artifact must
  surface every investigation that cites it and refuse to proceed silently — the shared-evidence query
  from TDR-025 exists and should be what answers it.
- **E is deferred, not rejected.** Masking a derived claim is worth having once the evidence beneath it
  can actually be withheld; done first it would be a false assurance.

## Recommendation

- **Option B as the mechanism, Option D as an explicit escalation.**
  - A `Redaction` is an append-only record: artifact, investigation, reason, principal, time. Evidence
    and the step log are untouched (I1, I3).
  - **Export declares what it withheld.** The manifest names each redacted artifact, with its reason —
    the bytes do not travel, the fact of the withholding does. A bundle stays an honest document.
  - **Reading a redacted artifact refuses**, with the reason, rather than returning bytes or an empty
    result — the same distinction the authorization work drew.
  - **Retention marks material expired through the same record**, so "may not be kept" and "may not
    leave" are one vocabulary with two consequences.
  - **Destruction is separate, opt-in, and tombstoned.** It requires naming every investigation that
    cites the artifact, and leaves an append-only record that the bytes existed and were destroyed, by
    whom and under what policy. A gap that explains itself is stronger than a gap.

- **What would change this decision:** a legal requirement that the *fact* of a redaction must not be
  disclosed either, which would make the declared manifest a liability and force a different shape;
  or a deployment where evidence is not shared across cases, which would make destruction per-case and
  much simpler.

## Post-implementation finding (2026-08-23) — a redaction that forgets is worse than none

The first store was in-memory, and the CLI is process-per-command, so a redaction recorded by one
invocation was gone by the next and the export happily carried material somebody had withheld.

**A governance mechanism that forgets is worse than not having one, because it is believed.** The
store is filesystem-backed — one append-only file per investigation under a configured root, kept
apart from both the evidence store and the step log, which is the same separation TDR-012 chose for
view state and what this decision's Option B requires. The seam stays, so a durable database backend
can replace it without touching a consumer.

## Open questions
- **Whether a redaction is per-investigation or global.** Per-case matches how the obligation usually
  arrives; global matches the fact that the artifact is one object. The recommendation records the
  investigation and applies the redaction to that case's exports and reads.
- **Whether a redacted artifact should still count for provenance closure (I2).** The step still cites
  it and the citation is still true; what changed is that the bytes cannot be produced. Leaning: yes,
  and the export says so.
- **The cache.** Redacting an artifact should evict any cached response that would reproduce it, or the
  material is still on the machine and a later acquisition would resurrect it.
- **Retention policy expression** — per investigation, per source, per artifact class — and who may set
  it. Deferred until there is a real obligation to model rather than an imagined one.
- Whether destruction should require more than one principal to authorise, which is cheap to add and
  hard to remove.

## References
- `CONTRACT.md` — capability `governance`; invariants I1, I2, I3, I9
- TDR-010/021 — the bundle format and why its integrity claim matters
- TDR-025 — investigations, and shared evidence across them
- TDR-023 — the principal a redaction is attributed to
- `ROADMAP.md` P5 Track B — "a bundle should not leave a machine before this exists"
