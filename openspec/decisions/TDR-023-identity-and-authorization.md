# TDR-023 — Identity and authorization

- **Status:** decided
- **Owner:** ed
- **Date:** 2026-08-23
- **Related:** TDR-025 (investigations — the unit this authorizes against, and the reason this is now worth doing), TDR-017 (the HTTP surface that is loopback-only because of this), TDR-012 (view state, whose `user` key is a placeholder), TDR-018 (secret provisioning — the seam shape this deliberately mirrors), TDR-010/021 (export; signing needs an identity); `CONTRACT.md` capability `governance`; invariants I8 (agent parity — authorization must not become a privileged path)

## Decision summary
> A `Principal` resolved from a bearer credential through a `PrincipalStore` seam, environment-variable backend first, OIDC and other issuers deferred behind the same seam — the shape TDR-018 already established for secrets. Authorization is **membership of an investigation**, because a case is the unit worth authorizing and "may use the graph" is not a useful permission. The server **refuses to bind beyond loopback unless a principal store is configured**, so the rule that is currently a comment becomes a mechanism.

## Context

Nothing in this system can say who is acting. The HTTP surface documents itself as "unauthenticated by
design at this stage: it binds to loopback and must not be exposed beyond the local machine until
governance lands", and view state keys itself by `localUser`, a string constant.

**That guard is a comment, not a mechanism.** `serve()` reads
`process.env.VIOKIT_HTTP_HOST ?? "127.0.0.1"`, so a single environment variable exposes an
unauthenticated engine that can acquire from the network, read every artifact, and export any
investigation. Nothing refuses. The comment is correct and it is not enforced, which is the same
class of problem as a capability claimed but not wired.

What it costs beyond that:
- The console and the API cannot leave one machine, so this is single-user by accident rather than by
  choice.
- View state cannot key itself honestly, and TDR-012 said so at the time.
- Bundle signing has nothing to sign as; an export attests integrity since export and says nothing
  about custody.
- An audit log has no subject.

**Why now:** TDR-025 landed investigations. Before that, authorization would have had to be about
"the graph", which is not a useful permission — either you can drive the engine or you cannot.
With cases, there is something worth granting: this investigation, to these people, and not the one
next to it.

Constraints:
- **I8**: agents and humans use the same operation table. Authorization must apply to both equally and
  must not create a path one has and the other does not.
- Local single-user use must stay frictionless. A tool that demands a token to look at your own
  machine will be worked around.
- No new runtime dependency for the default path — this is an embedded, local-first system.
- Evidence stays content-addressed and shared across investigations (TDR-025), so authorization is
  about *reaching* an artifact through a case, not about the artifact itself.

Affects `packages/schema` (a principal, membership), `packages/engine` (the check), `packages/agent`
(request → principal, the bind guard), and `apps/console`.

## Options considered

### Authentication

#### Option A — One local operator; no authentication, but enforced
- **Description:** Formalise what exists. A single implicit principal; the server refuses to bind
  anywhere but loopback.
- **Pros:** No credential to manage, nothing to leak, no dependency. Honest about what this is today,
  and closes the environment-variable hole immediately.
- **Cons:** Does not unlock anything. Two people still cannot share a deployment, and an agent still
  acts under a human's undifferentiated authority — so the audit trail can never say which.

#### Option B — Bearer credential resolved to a principal through a seam
- **Description:** A `PrincipalStore` resolves a presented credential to a `Principal` (id, display
  name). Environment-variable backend first — the same shape TDR-018 chose for secrets — with a file
  backend behind it and external issuers later. No store configured means local single-user, loopback
  only, exactly as today.
- **Pros:** Mirrors a decision this codebase already made and lives with, so there is one seam pattern
  rather than two. Gives an *agent* its own principal, which is strictly better than an agent sharing
  a human's: the trail can then say which one acted. No dependency. Frictionless default preserved.
- **Cons:** Token distribution is the deployment's problem, and bearer credentials are only as good as
  their handling. No expiry, revocation, or rotation unless a backend implements it.

#### Option C — OIDC against an external identity provider
- **Description:** Delegate authentication; validate tokens against a provider's JWKS.
- **Pros:** The right answer for an organisation — real accounts, revocation, MFA, none of it ours to
  build.
- **Cons:** A dependency and a network reachability requirement in a local-first, offline-capable tool
  (I11 exists because offline matters here). Heavy for the single-operator case that is the whole
  current population. Nothing about this is foreclosed by B — it is a backend behind the same seam.

#### Option D — Mutual TLS
- **Description:** Client certificates.
- **Pros:** Strong, and no bearer token to leak.
- **Cons:** Painful from a browser, painful for an agent, and a certificate lifecycle to run. The cost
  lands on exactly the two clients this system has.

### Authorization

#### Option E — Any authenticated principal may do anything
- **Pros:** Trivial. Honest for a trusted small team.
- **Cons:** Then identity is only for the audit trail, and "two people who cannot see each other's
  material" — the roadmap's own exit criterion for this track — stays unmet.

#### Option F — Membership of an investigation
- **Description:** An investigation records who created it; principals are members. Reaching a case
  you are not a member of fails. Creating one makes you its owner.
- **Pros:** Authorizes the unit that actually means something now. Directly satisfies the exit
  criterion. Composes with TDR-024 later: retention and redaction apply per case too.
- **Cons:** Membership has to be administered, and there is no interface for that yet beyond the
  operation table. Evidence is shared across cases, so an artifact reachable through a case you *are*
  in may also be cited by one you are not — an overlap the shared-evidence query can reveal.

#### Option G — Global roles (admin / analyst / reader)
- **Pros:** Familiar, and cheap to check.
- **Cons:** Cuts the wrong way. The question here is rarely "what kind of user is this" and almost
  always "is this their case".

## Evaluation criteria
1. Does the local single-operator path stay frictionless? — non-negotiable, or it gets worked around
2. Does it close the bind hole with a mechanism rather than a comment?
3. Can an agent act as itself, so the trail can say which one acted (I8, and audit later)?
4. Dependencies added, and whether the tool still works offline (I11)
5. Does it satisfy "two people, one deployment, without seeing each other's material"?
6. Whether it forecloses a real identity provider later

## Analysis

- **Criterion 1 eliminates C as the *default*** and keeps it as a backend. A tool that cannot be used
  on your own laptop without standing up an IdP will not be used on your own laptop.
- **Criterion 2 is independent of the rest and should not wait for it.** Whatever authentication is
  chosen, `serve()` refusing a non-loopback bind without a configured principal store is a few lines
  and removes a live hazard. It is listed under B here but belongs in any option.
- **Criterion 3 is the argument for B over A**, and it is stronger than it first looks. This system is
  built for agents as first-class operators (I8). An agent with its own principal makes "which agent
  acquired this" answerable; an agent borrowing a human's makes it permanently unanswerable, and no
  later audit-log work can recover it.
- **Criterion 4 favours A and B**, and rules C out of the default path: an offline-capable tool whose
  authentication requires reaching an IdP is not offline-capable.
- **Criterion 5 is what F buys and E does not.** It is also the roadmap's stated exit criterion for
  this track, so E would mean declaring the track met without meeting it.
- **Criterion 6 favours B decisively.** The seam is the point: an environment backend today, a file
  backend next, OIDC when someone needs it, and no consumer changes when that happens. TDR-018 made
  this exact trade for secrets and it has held.
- **D loses on its own terms.** It is the strongest mechanism and the worst fit for a browser and an
  agent, which are the only two clients.

## Recommendation

- **Option B + F.**
  - `Principal` — an id and a display name. Resolved from a bearer credential by a `PrincipalStore`
    seam; environment-variable backend first, others behind it.
  - **No store configured means local single-user**: one implicit principal, loopback only. The
    default stays frictionless and honest.
  - **The server refuses to bind beyond loopback unless a store is configured.** The comment becomes a
    mechanism. This is the part that closes a live hazard and should land regardless.
  - Every operation runs *as* a principal, on all three front-ends identically (I8) — authorization
    must not become the privileged path that invariant forbids.
  - **Authorization is membership of an investigation.** Creating one makes you its owner; reaching a
    case you are not a member of fails as a refusal, not as an empty result — an empty answer would be
    indistinguishable from a case with nothing in it.
  - View state keys by the resolved principal, retiring TDR-012's placeholder.

- **What would change this decision:** a deployment with enough people to need real account lifecycle,
  which is when C's backend gets written; or a requirement to expose this surface publicly, which
  would want far more than authentication.

## Open questions
- **How membership is administered.** Operations exist; an interface does not, and a case whose only
  member leaves is a case nobody can open.
- **Whether a principal may see that an investigation exists without being a member.** Listing names
  is itself disclosure; hiding them makes "share this case with me" hard to ask for.
- ~~**What signs an export**~~ — half answered by `acquisition-custody` (2026-08-23): the acquiring
  principal is now *on* the evidence record and travels in the bundle manifest, so custody has
  something to attest about. What remains is the signing itself — an unsigned `acquiredBy` is an
  assertion by the exporting deployment, not proof, and the manifest says so.
- Whether the audit log is a separate capability or a projection of the step log with principals
  attached.
- Credential expiry and revocation, which the environment backend cannot express at all.

## References
- TDR-018 — the `SecretProvider` seam whose shape this mirrors
- TDR-025 — investigations, the unit this authorizes
- TDR-017 — the HTTP surface, and its loopback-only note
- `CONTRACT.md` — capability `governance`; invariant I8
- `ROADMAP.md` P5 Track B — exit criterion "an investigation that two people can work on without
  seeing each other's credentials or each other's redacted material"
