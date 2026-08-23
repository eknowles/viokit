import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). `access` records
// how the source is reached — the catalog derives runnability from it, so a
// browser-only or key-gated source is reported as unusable rather than
// advertised alongside ones the engine can actually acquire.

/** Mapillary — Crowdsourced street-level imagery platform with an API for exploring geotagged photos worldwide. */
export const mapillary_com: SourceSpec = {
  access: "open_api",
  id: "mapillary.com",
  transport: "http",
  url: "https://www.mapillary.com/app",
};

/** Zoom Earth — Live interactive satellite imagery and weather visualization, including recent and real-time imagery overlays. */
export const zoom_earth: SourceSpec = {
  access: "open_api",
  id: "zoom.earth",
  transport: "http",
  url: "https://zoom.earth",
};
