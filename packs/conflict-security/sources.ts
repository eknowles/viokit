import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). `access` records
// how the source is reached — the catalog derives runnability from it, so a
// browser-only or key-gated source is reported as unusable rather than
// advertised alongside ones the engine can actually acquire.

/** ACLED — Global dataset of political violence and protest events with API access. */
export const acleddata_com: SourceSpec = {
  access: "requires_key",
  id: "acleddata.com",
  transport: "http",
  url: "https://acleddata.com",
};

/** Malpedia — Authoritative registry of malware families and threat actor groups linking actors to their tooling and TTPs. */
export const malpedia_caad_fkie_fraunhofer_de: SourceSpec = {
  access: "open_api",
  id: "malpedia.caad.fkie.fraunhofer.de",
  transport: "http",
  url: "https://malpedia.caad.fkie.fraunhofer.de",
};

/** AlienVault OTX — Open threat intelligence exchange aggregating indicators, pulses, and malware analysis with a REST API. */
export const otx_alienvault_com: SourceSpec = {
  access: "open_api",
  id: "otx.alienvault.com",
  transport: "http",
  url: "https://otx.alienvault.com",
};

/** UCDP - Uppsala Conflict Data Program — Authoritative dataset on armed conflict, one-sided and non-state violence, with downloadable datasets by year and country. */
export const pcr_uu_se: SourceSpec = {
  access: "dataset",
  id: "pcr.uu.se",
  transport: "dataset",
  url: "https://www.pcr.uu.se/research/UCDP",
};

/** URLhaus — Authoritative feed of malicious URLs used for malware and botnet distribution, with a REST API. */
export const urlhaus_abuse_ch: SourceSpec = {
  access: "open_api",
  id: "urlhaus.abuse.ch",
  transport: "http",
  url: "https://urlhaus.abuse.ch",
};
