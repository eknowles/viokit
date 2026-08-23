# Classifying a Source Needs an Endpoint

## Why

`access-verification` built the probe; `promoted-sources-are-registered` made the whole catalog
reachable. This change is what running the sweep taught.

The first sweep of all 38 registered sources reported **32 of 36 disagreements** — apparently a
catalog almost entirely mis-classified. It was not. Every one of the 36 served `text/html`, because
**31 of the 38 specs point at a bare host** and the other 7 at landing or app pages. Not one spec
addresses an endpoint.

A site's front door serves a page whatever its data interface is. So the probe was measuring
homepages and confidently reporting `browser_scrape` — and acting on that would have marked most of
the catalog browser-only, making well-known APIs unrunnable in any deployment without a browser. The
"one URL is not a site" risk recorded in `access-verification`'s design turned out not to be a corner
case but the dominant one.

The sweep also drew **three 403s**, from large sites that block unidentified clients. The classifier
read them as `requires_key`, asserting a credential requirement nobody established: a 403 is
*forbidden*, which is what a credential wall answers and equally what a site answers to a client it
dislikes.

The real finding is not that the classifications are wrong. It is that **the specs were never
finished**: promotion recorded each candidate's homepage, and the PACK_RECIPE step of giving a source
a real endpoint was never done. A source pointed at a front door is registered but not wired up — a
transform over it would acquire a homepage.

## What Changes

- **The classifier refuses to classify a page served from a front door**, returning `unknown` and
  naming what would fix it, instead of reporting `browser_scrape` about a homepage.
- **A 403 is inconclusive**, not a credential requirement. `401` — which means exactly one thing —
  still verifies as `requires_key`.
- **The catalog reports which specs point at a front door**, so the ones that are registered but not
  wired up are enumerable rather than a thing someone has to notice.
- **The probe reports why rendering failed** instead of collapsing "we looked and could not tell" into
  "we had no browser".

Not in this change: giving the 31 specs real endpoint URLs. That is research per source, it is the
actual remaining Track A work, and this change is what makes it enumerable.

## Capabilities

### Modified Capabilities

- `source-runtime`: a classification is refused where the probed url cannot support one, and a
  forbidden response is reported as inconclusive.
- `agent-integration`: catalog entries report whether a source's url addresses a site or something
  within it.

## Impact

- `packages/schema`: `isBareHost`; the front-door and 403 rules in `classifyAccess`; `renderError` on
  `AccessSignals`; `frontDoor` on `CatalogEntry`.
- `packages/engine`: the probe carries the render failure through; the catalog derives `frontDoor`.
- Tests: the front-door rule and its converse, the 403 rule, bare-host parsing, and the catalog
  reporting front doors.
- No TDR required.

## Sweep findings (2026-08-23)

Recorded because the next person to run this should not have to rediscover it. All 38 registered
sources, one request each, through the source runtime.

| Outcome | Count |
|---|---|
| Front door — not classifiable from the probed url | 27 |
| Forbidden (403) — inconclusive | 3 |
| Gateway error (502) | 1 |
| Page, content present without rendering | 3 |
| Page, content only present once rendered | 2 |
| Failed to acquire at all | 2 |

The two that could not be acquired are worth their own look: `bgpview.io` fails at the transport, and
`pcr.uu.se` is declared a `dataset` transport pointed at an HTML research page.

Of the five real page findings, only `bop.gov` is unambiguous — it declares `open_api` while its url
is the Bureau of Prisons inmate locator, a web form, and its own pack manifest already describes the
pack's browser-only interfaces. The other four (`who.int`, `sentinel-hub.com`, `mapillary.com`,
`securitytrails.com`) point at app or landing pages for services that do publish APIs elsewhere, so
the correct repair is the **url**, not the classification. No `access` value was changed by this
sweep: the probe reports and does not apply, which is the decision that stopped a damaging bulk edit.
