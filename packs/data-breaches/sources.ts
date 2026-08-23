import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). `access` records
// how the source is reached — the catalog derives runnability from it, so a
// browser-only or key-gated source is reported as unusable rather than
// advertised alongside ones the engine can actually acquire.

/** DeHashed — Large searchable repository of aggregated breached credentials and leaked assets, with API. */
export const dehashed_com: SourceSpec = {
  access: "requires_key",
  id: "dehashed.com",
  transport: "http",
  url: "https://dehashed.com",
};

/** Have I Been Pwned — Authoritative breach search across multiple data breaches by email or username, with a documented API. */
export const haveibeenpwned_com: SourceSpec = {
  access: "open_api",
  id: "haveibeenpwned.com",
  transport: "http",
  url: "https://haveibeenpwned.com",
};

/** VirusTotal — Analyzes domains, IPs, URLs, and files against multiple antivirus and reputation engines to detect malware and breaches. */
export const virustotal_com: SourceSpec = {
  access: "open_api",
  id: "virustotal.com",
  transport: "http",
  url: "https://www.virustotal.com",
};
