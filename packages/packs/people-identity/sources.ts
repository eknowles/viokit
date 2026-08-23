import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). `access` records
// how the source is reached — the catalog derives runnability from it, so a
// browser-only or key-gated source is reported as unusable rather than
// advertised alongside ones the engine can actually acquire.

/** Federal Bureau of Prisons Inmate Locator — Authoritative search of US federal inmates incarcerated from 1982 to present. */
export const bop_gov: SourceSpec = {
  access: "open_api",
  id: "bop.gov",
  transport: "http",
  url: "https://www.bop.gov/inmateloc",
};

/** FamilySearch — Large free genealogy database of historical records, family trees, and genealogy data (registration required). */
export const familysearch_org: SourceSpec = {
  access: "dataset",
  id: "familysearch.org",
  transport: "http",
  url: "https://familysearch.org",
};

/** Judyrecords — Free nationwide search over 400M+ US court case records. */
export const judyrecords_com: SourceSpec = {
  access: "browser_scrape",
  id: "judyrecords.com",
  transport: "http",
  url: "https://www.judyrecords.com",
};

/** OpenSanctions — Open-source database of sanctions targets and politically exposed persons, linking identities, aliases, and identifiers. */
export const opensanctions_org: SourceSpec = {
  access: "open_api",
  id: "opensanctions.org",
  transport: "http",
  url: "https://www.opensanctions.org",
};

/** Voter Records — Free research tool over 100M+ US voter registration records. */
export const voterrecords_com: SourceSpec = {
  access: "browser_scrape",
  id: "voterrecords.com",
  transport: "http",
  url: "https://voterrecords.com",
};
