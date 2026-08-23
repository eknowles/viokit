import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). `access` records
// how the source is reached — the catalog derives runnability from it, so a
// browser-only or key-gated source is reported as unusable rather than
// advertised alongside ones the engine can actually acquire.

/** Wayback Machine — Internet Archive: explore historical snapshots of any website, with a public API. */
export const archive_org: SourceSpec = {
  access: "open_api",
  id: "archive.org",
  transport: "http",
  url: "https://web.archive.org",
};

/** BGPView — BGP/ASN/IP data API. */
export const bgpview_io: SourceSpec = {
  access: "open_api",
  id: "bgpview.io",
  transport: "http",
  url: "https://bgpview.io",
};

/** crt.sh Certificate Transparency — Certificate Transparency log search with free JSON API */
export const crt_sh: SourceSpec = {
  access: "open_api",
  id: "crt.sh",
  transport: "http",
  // The JSON API, not the front door. `output=json` is what makes it an API at
  // all; without it crt.sh answers a web page, which is what this spec used to
  // fetch and why its transform could only invent a result.
  url: "https://crt.sh/?q={domain}&output=json",
};

/** DNSViz — ISC DNSViz: DNSSEC and DNS analysis. */
export const dnsviz_net: SourceSpec = {
  access: "open_api",
  id: "dnsviz.net",
  transport: "http",
  url: "https://dnsviz.net",
};

/** DomainTools WHOIS — WHOIS lookup and historical domain/IP registration data. */
export const domaintools_com: SourceSpec = {
  access: "open_api",
  id: "domaintools.com",
  transport: "http",
  url: "https://whois.domaintools.com",
};

/** ICANN Lookup — Authoritative ICANN WHOIS/RDAP registry lookup. */
export const lookup_icann_org: SourceSpec = {
  access: "open_api",
  id: "lookup.icann.org",
  transport: "http",
  url: "https://lookup.icann.org",
};

/** Robtex — IP address and domain research with reverse DNS, whois, and AS macros across multiple services. */
export const robtex_com: SourceSpec = {
  access: "open_api",
  id: "robtex.com",
  transport: "http",
  url: "https://www.robtex.com",
};

/**
 * SecurityTrails subdomain enumeration. Verified working 2026-08-23 — see
 * `openspec/exploration/05-source-access.md` for the endpoint, the auth scheme,
 * and what came back.
 *
 * `{hostname}` is bound from the transform's input (`binding.ts`); the key is a
 * reference, never a literal, because packs are tracked source (TDR-018).
 */
export const securitytrails_com: SourceSpec = {
  access: "requires_key",
  auth: {
    name: "APIKEY",
    scheme: "header",
    secretRef: "SECURITYTRAILS_API_KEY",
  },
  id: "securitytrails.com",
  transport: "http",
  url: "https://api.securitytrails.com/v1/domain/{hostname}/subdomains",
};

/** urlscan.io — Free service to scan and analyze websites and their network behavior, with a documented API. */
export const urlscan_io: SourceSpec = {
  access: "open_api",
  id: "urlscan.io",
  transport: "http",
  url: "https://urlscan.io",
};

/**
 * host.io full domain record — web metadata, DNS, related domains, IP info in
 * one response. Verified working 2026-08-23; free plan returns at most 5
 * domains per page.
 */
export const host_io: SourceSpec = {
  access: "requires_key",
  auth: { scheme: "bearer", secretRef: "HOSTIO_TOKEN" },
  id: "host.io",
  transport: "http",
  url: "https://host.io/api/full/{domain}",
};
