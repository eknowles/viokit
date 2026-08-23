import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). The discovery
// metadata each candidate carried is kept as documentation above its spec.

/** MarineTraffic — Global ship tracking and maritime data via AIS, real-time vessel positions and historical routes. Access: open_api. */
export const marinetraffic_com: SourceSpec = {
  id: "marinetraffic.com",
  transport: "http",
  url: "https://www.marinetraffic.com",
};

/** VesselFinder — Free AIS vessel tracking web service showing real-time ship positions and marine traffic from the global AIS network. Access: open_api. */
export const vesselfinder_com: SourceSpec = {
  id: "vesselfinder.com",
  transport: "http",
  url: "https://www.vesselfinder.com",
};
