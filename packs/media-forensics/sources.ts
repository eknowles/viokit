import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). The discovery
// metadata each candidate carried is kept as documentation above its spec.

/** SunCalc — Computes sun position and shadow geometry for a location and time, used to geolocate and chronolocate photos. Access: browser_scrape. */
export const suncalc_org: SourceSpec = {
  id: "suncalc.org",
  transport: "http",
  url: "https://www.suncalc.org",
};
