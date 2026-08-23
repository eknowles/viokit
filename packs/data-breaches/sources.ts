import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). The discovery
// metadata each candidate carried is kept as documentation above its spec.

/** DeHashed — Large searchable repository of aggregated breached credentials and leaked assets, with API. Access: requires_key. */
export const dehashed_com: SourceSpec = {
  id: "dehashed.com",
  transport: "http",
  url: "https://dehashed.com",
};

/** Have I Been Pwned — Authoritative breach search across multiple data breaches by email or username, with a documented API. Access: open_api. */
export const haveibeenpwned_com: SourceSpec = {
  id: "haveibeenpwned.com",
  transport: "http",
  url: "https://haveibeenpwned.com",
};

/** VirusTotal — Analyzes domains, IPs, URLs, and files against multiple antivirus and reputation engines to detect malware and breaches. Access: open_api. */
export const virustotal_com: SourceSpec = {
  id: "virustotal.com",
  transport: "http",
  url: "https://www.virustotal.com",
};
