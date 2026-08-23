import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). The discovery
// metadata each candidate carried is kept as documentation above its spec.

/** Caselaw Access Project — Full-text database of historical US state appellate court cases, freely accessible with API. Access: open_api. */
export const case_law: SourceSpec = {
  id: "case.law",
  transport: "http",
  url: "https://case.law",
};

/** OpenCorporates — Global open database of registered companies and their officers, linking corporate entities across jurisdictions. Access: open_api. */
export const opencorporates_com: SourceSpec = {
  id: "opencorporates.com",
  transport: "http",
  url: "https://opencorporates.com",
};

/** OpenOwnership Register — Open database of beneficial ownership information for registered companies worldwide. Access: dataset. */
export const openownership_org: SourceSpec = {
  id: "openownership.org",
  transport: "http",
  url: "https://register.openownership.org",
};

/** SEC EDGAR — Authoritative full-text database of company filings and financial reports for US publicly traded companies, with full-text search API. Access: dataset. */
export const sec_gov: SourceSpec = {
  id: "sec.gov",
  transport: "http",
  url: "https://www.sec.gov/edgar",
};

/** World Bank Data — Authoritative open database of global development, economic, and financial statistics with public API. Access: dataset. */
export const worldbank_org: SourceSpec = {
  id: "worldbank.org",
  transport: "http",
  url: "https://data.worldbank.org",
};
