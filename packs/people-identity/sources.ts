import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). The discovery
// metadata each candidate carried is kept as documentation above its spec.

/** Federal Bureau of Prisons Inmate Locator — Authoritative search of US federal inmates incarcerated from 1982 to present. Access: open_api. */
export const bop_gov: SourceSpec = {
  id: "bop.gov",
  transport: "http",
  url: "https://www.bop.gov/inmateloc",
};

/** FamilySearch — Large free genealogy database of historical records, family trees, and genealogy data (registration required). Access: dataset. */
export const familysearch_org: SourceSpec = {
  id: "familysearch.org",
  transport: "http",
  url: "https://familysearch.org",
};

/** Judyrecords — Free nationwide search over 400M+ US court case records. Access: browser_scrape. */
export const judyrecords_com: SourceSpec = {
  id: "judyrecords.com",
  transport: "http",
  url: "https://www.judyrecords.com",
};

/** OpenSanctions — Open-source database of sanctions targets and politically exposed persons, linking identities, aliases, and identifiers. Access: open_api. */
export const opensanctions_org: SourceSpec = {
  id: "opensanctions.org",
  transport: "http",
  url: "https://www.opensanctions.org",
};

/** Voter Records — Free research tool over 100M+ US voter registration records. Access: browser_scrape. */
export const voterrecords_com: SourceSpec = {
  id: "voterrecords.com",
  transport: "http",
  url: "https://voterrecords.com",
};
