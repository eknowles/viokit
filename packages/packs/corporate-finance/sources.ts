import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). `access` records
// how the source is reached — the catalog derives runnability from it, so a
// browser-only or key-gated source is reported as unusable rather than
// advertised alongside ones the engine can actually acquire.

/** Caselaw Access Project — Full-text database of historical US state appellate court cases, freely accessible with API. */
export const case_law: SourceSpec = {
  access: "open_api",
  id: "case.law",
  transport: "http",
  url: "https://case.law",
};

/** OpenCorporates — Global open database of registered companies and their officers, linking corporate entities across jurisdictions. */
export const opencorporates_com: SourceSpec = {
  access: "open_api",
  id: "opencorporates.com",
  transport: "http",
  url: "https://opencorporates.com",
};

/** OpenOwnership Register — Open database of beneficial ownership information for registered companies worldwide. */
export const openownership_org: SourceSpec = {
  access: "dataset",
  id: "openownership.org",
  transport: "http",
  url: "https://register.openownership.org",
};

/** SEC EDGAR — Authoritative full-text database of company filings and financial reports for US publicly traded companies, with full-text search API. */
export const sec_gov: SourceSpec = {
  access: "dataset",
  id: "sec.gov",
  transport: "http",
  url: "https://www.sec.gov/edgar",
};

/** World Bank Data — Authoritative open database of global development, economic, and financial statistics with public API. */
export const worldbank_org: SourceSpec = {
  access: "dataset",
  id: "worldbank.org",
  transport: "http",
  url: "https://data.worldbank.org",
};
