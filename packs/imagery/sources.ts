import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). The discovery
// metadata each candidate carried is kept as documentation above its spec.

/** Mapillary — Crowdsourced street-level imagery platform with an API for exploring geotagged photos worldwide. Access: open_api. */
export const mapillary_com: SourceSpec = {
  id: "mapillary.com",
  transport: "http",
  url: "https://www.mapillary.com/app",
};

/** Zoom Earth — Live interactive satellite imagery and weather visualization, including recent and real-time imagery overlays. Access: open_api. */
export const zoom_earth: SourceSpec = {
  id: "zoom.earth",
  transport: "http",
  url: "https://zoom.earth",
};
