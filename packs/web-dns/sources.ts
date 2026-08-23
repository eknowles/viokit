import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). The discovery
// metadata each candidate carried is kept as documentation above its spec.

/** Wayback Machine — Internet Archive: explore historical snapshots of any website, with a public API. Access: open_api. */
export const archive_org: SourceSpec = {
  id: "archive.org",
  transport: "http",
  url: "https://web.archive.org",
};

/** BGPView — BGP/ASN/IP data API. Access: open_api. */
export const bgpview_io: SourceSpec = {
  id: "bgpview.io",
  transport: "http",
  url: "https://bgpview.io",
};

/** crt.sh Certificate Transparency — Certificate Transparency log search with free JSON API Access: open_api. */
export const crt_sh: SourceSpec = {
  id: "crt.sh",
  transport: "http",
  url: "https://crt.sh/",
};

/** DNSViz — ISC DNSViz: DNSSEC and DNS analysis. Access: open_api. */
export const dnsviz_net: SourceSpec = {
  id: "dnsviz.net",
  transport: "http",
  url: "https://dnsviz.net",
};

/** DomainTools WHOIS — WHOIS lookup and historical domain/IP registration data. Access: open_api. */
export const domaintools_com: SourceSpec = {
  id: "domaintools.com",
  transport: "http",
  url: "https://whois.domaintools.com",
};

/** ICANN Lookup — Authoritative ICANN WHOIS/RDAP registry lookup. Access: open_api. */
export const lookup_icann_org: SourceSpec = {
  id: "lookup.icann.org",
  transport: "http",
  url: "https://lookup.icann.org",
};

/** Robtex — IP address and domain research with reverse DNS, whois, and AS macros across multiple services. Access: open_api. */
export const robtex_com: SourceSpec = {
  id: "robtex.com",
  transport: "http",
  url: "https://www.robtex.com",
};

/** SecurityTrails — API for current and historical DNS records, WHOIS history, and subdomain discovery. Access: open_api. */
export const securitytrails_com: SourceSpec = {
  id: "securitytrails.com",
  transport: "http",
  url: "https://securitytrails.com/dns-trails",
};

/** urlscan.io — Free service to scan and analyze websites and their network behavior, with a documented API. Access: open_api. */
export const urlscan_io: SourceSpec = {
  id: "urlscan.io",
  transport: "http",
  url: "https://urlscan.io",
};
