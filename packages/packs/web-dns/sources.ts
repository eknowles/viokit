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
  access: "unknown",
  id: "crt.sh",
  transport: "http",
  url: "https://crt.sh/",
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

/** SecurityTrails — API for current and historical DNS records, WHOIS history, and subdomain discovery. */
export const securitytrails_com: SourceSpec = {
  access: "open_api",
  id: "securitytrails.com",
  transport: "http",
  url: "https://securitytrails.com/dns-trails",
};

/** urlscan.io — Free service to scan and analyze websites and their network behavior, with a documented API. */
export const urlscan_io: SourceSpec = {
  access: "open_api",
  id: "urlscan.io",
  transport: "http",
  url: "https://urlscan.io",
};
