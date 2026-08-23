import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). `access` records
// how the source is reached — the catalog derives runnability from it, so a
// browser-only or key-gated source is reported as unusable rather than
// advertised alongside ones the engine can actually acquire.

/** MarineTraffic — Global ship tracking and maritime data via AIS, real-time vessel positions and historical routes. */
export const marinetraffic_com: SourceSpec = {
  access: "open_api",
  id: "marinetraffic.com",
  transport: "http",
  url: "https://www.marinetraffic.com",
};

/** VesselFinder — Free AIS vessel tracking web service showing real-time ship positions and marine traffic from the global AIS network. */
export const vesselfinder_com: SourceSpec = {
  access: "open_api",
  id: "vesselfinder.com",
  transport: "http",
  url: "https://www.vesselfinder.com",
};
