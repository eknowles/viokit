import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). `access` records
// how the source is reached — the catalog derives runnability from it, so a
// browser-only or key-gated source is reported as unusable rather than
// advertised alongside ones the engine can actually acquire.

/** SunCalc — Computes sun position and shadow geometry for a location and time, used to geolocate and chronolocate photos. */
export const suncalc_org: SourceSpec = {
  access: "browser_scrape",
  id: "suncalc.org",
  transport: "browser",
  url: "https://www.suncalc.org",
};
