# 05 — Source access dossier

> What five named sources actually offer, what reaching them requires, and what was verified rather
> than read. Written before any spec was changed, because the catalog's whole problem has been specs
> written from assumptions (see `ROADMAP.md` P5 Track A).
>
> **Verified 2026-08-23** by one unauthenticated request per endpoint. "Documented" means taken from
> the vendor's own docs; "observed" means this deployment saw it.

## Method

Each source was probed once, unauthenticated, at the endpoint its documentation names. An
unauthenticated probe is deliberately informative: what an API does when you present nothing tells
you whether it is an API at all, and how it signals that a credential is missing.

## Summary

| Source | Endpoint verified | Observed | Auth | Free tier (documented) |
|---|---|---|---|---|
| securitytrails.com | `GET https://api.securitytrails.com/v1/ping` | **401**, `text/plain`-ish, "Please check user credentials" | `APIKEY` header, or `?apikey=` | not stated in docs read |
| host.io | `GET https://host.io/api/full/{domain}` | **400**, `application/json`, `{"error":"API Access Token Required"}` | `Authorization: Bearer`, Basic, or `?token=` | free plan, "maximum of 5 domains per page" |
| whoisxmlapi.com | `GET https://www.whoisxmlapi.com/whoisserver/WhoisService?domainName=…&outputFormat=JSON` | **401**, `application/json`, `AUTHENTICATE_04 … API key required` | `Authorization: Bearer`, or `?apiKey=` | 500 queries on signup |
| censys.io | `GET https://api.platform.censys.io/v3/global/asset/host/{ip}` | **401**, `application/json`, `Unauthorized` | `Authorization: Bearer` (personal access token) | free tier: host, web property, certificate **lookup** only |
| fullcontact.com | `POST https://api.fullcontact.com/v3/person.enrich` | **401**, `application/json`, `{"status":401,"message":"Unauthorized"}` | `Authorization: Bearer` | not stated in docs read |

All five are **real APIs at real endpoints** requiring credentials — which is already more than any of
the 38 specs currently in the catalog can say, none of which address an endpoint at all.

## Per source

### securitytrails.com — DNS/WHOIS history, subdomains
- **Docs:** https://docs.securitytrails.com/docs/overview · auth: https://docs.securitytrails.com/docs/authentication
- **Base:** `https://api.securitytrails.com/v1`
- **Auth:** header `APIKEY: <key>`. A query-string form exists and the docs discourage it — "often
  logged in clear-text" — so use the header.
- **Useful endpoint:** `GET /domain/{hostname}/subdomains` → `{"subdomains": ["www", "mail", …]}`
  (documented). Also `GET /domain/{hostname}/whois`, and DNS history by record type.
- **Note:** already in `web-dns` as `securitytrails.com` pointing at `https://securitytrails.com/dns-trails`
  — a marketing page — and classified `open_api`. Both wrong; this dossier is what corrects them.

### host.io — domain metadata, DNS, related domains
- **Docs:** https://host.io/docs
- **Base:** `https://host.io`
- **Auth:** `Authorization: Bearer <token>`, HTTP Basic (`-u $TOKEN:`), or `?token=`.
- **Useful endpoints:** `/api/full/{domain}` (web + dns + related + ipinfo), `/api/dns/{domain}`,
  `/api/related/{domain}`, `/api/domains/{field}/{value}` for reverse lookups by IP, NS, MX, ASN.
- **Free tier:** documented as "maximum of 5 domains per page".

### whoisxmlapi.com — WHOIS
- **Docs:** https://whois.whoisxmlapi.com/documentation/making-requests
- **Endpoint:** `https://www.whoisxmlapi.com/whoisserver/WhoisService`
- **Auth:** `Authorization: Bearer <key>` or `?apiKey=`. Requires `outputFormat=JSON`, or it answers XML.
- **Required parameter:** `domainName`.
- **Free tier:** 500 queries on signup.

### censys.io — hosts, certificates, web properties
- **Docs:** https://docs.censys.com/reference/get-started
- **Base:** `https://api.platform.censys.io/v3/` (Platform). A legacy `https://search.censys.io/api/`
  still exists for v1/v2.
- **Auth:** `Authorization: Bearer <personal access token>`.
- **Free tier:** host, web property, and certificate **lookup** only — no collections, no historical
  data. Enough for enrichment, not for search-driven discovery.
- **Caveat, stated because it is not settled:** the exact Global Data path was not confirmed. The docs
  page for "get a host" carried only the schema, not the path, and the endpoint answered **401 before
  routing** — so a 401 here does not prove the path is right. Confirm against a real token before
  relying on it.

### fullcontact.com — person/company enrichment
- **Docs:** https://docs.fullcontact.com/docs/quickstart
- **Endpoint:** `POST https://api.fullcontact.com/v3/person.enrich`
- **Auth:** `Authorization: Bearer <key>`.
- **Input:** one of email, phone, or twitter.
- **Fit:** this is `people-identity`, not `web-dns`, and it is enrichment of a known selector rather
  than discovery.

## Two gaps this exposed in the engine

Both were found by probing, not by reading code, and both block wiring these sources.

### 1. A source cannot express a POST

`SourceSpec` has no method and the HTTP transport calls `HttpClient.get` unconditionally
(`packages/sources/src/http.ts`). **FullContact's enrich endpoint is POST with a JSON body, so it
cannot be expressed at all.** So are most enrichment APIs — the pattern of "send me a selector, I
return a profile" is usually a POST.

This is a real capability gap, not a detail: it silently excludes an entire class of source, and the
catalog's `access` vocabulary has no way to say "this is an API we cannot shape a request for".

### 2. The access classifier reads 400 as inconclusive

`classifyAccess` maps 401 and 403 deliberately (TDR-024/TDR-023 reasoning) and anything else ≥400 to
`unknown`. **host.io signals a missing credential with 400**, so the probe would classify a plainly
key-gated API as unclassifiable.

Not obviously a bug — 400 genuinely is ambiguous, and reading vendor error bodies to guess would be
the sort of heuristic this codebase has been removing. But it is a limit worth knowing before running
the classifier across a catalog and trusting the output.

## What is needed to proceed

Credentials, held as `SecretProvider` references (TDR-018) — the spec carries a *reference and a
scheme*, never a literal, so no key can be written into a tracked pack file.

| Source | Suggested env var | `SourceAuth` scheme |
|---|---|---|
| securitytrails.com | `SECURITYTRAILS_API_KEY` | `header`, name `APIKEY` |
| host.io | `HOSTIO_TOKEN` | `bearer` |
| whoisxmlapi.com | `WHOISXML_API_KEY` | `bearer` |
| censys.io | `CENSYS_PAT` | `bearer` |
| fullcontact.com | `FULLCONTACT_API_KEY` | `bearer` — **blocked on POST support** |

Free tiers exist for host.io, whoisxmlapi (500 queries), and censys (lookup only), so three of the
five can be exercised without spending anything.

## Sources

- SecurityTrails — https://docs.securitytrails.com/docs/overview, https://docs.securitytrails.com/docs/authentication
- host.io — https://host.io/docs
- WhoisXML API — https://whois.whoisxmlapi.com/documentation/making-requests
- Censys — https://docs.censys.com/reference/get-started
- FullContact — https://docs.fullcontact.com/docs/quickstart
