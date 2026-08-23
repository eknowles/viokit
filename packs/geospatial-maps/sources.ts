import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). The discovery
// metadata each candidate carried is kept as documentation above its spec.

/** GeoNames — Free global gazetteer database of place names, coordinates, and administrative subdivisions, with a documented REST API. Access: open_api. */
export const geonames_org: SourceSpec = {
  id: "geonames.org",
  transport: "http",
  url: "https://www.geonames.org",
};

/** OpenStreetMap — Open collaborative geographic database of the world, with public APIs for map data, geocoding, and routing. Access: open_api. */
export const openstreetmap_org: SourceSpec = {
  id: "openstreetmap.org",
  transport: "http",
  url: "https://www.openstreetmap.org",
};

/** Sentinel Hub Playground — Authoritative viewer and API for European Space Agency Sentinel satellite imagery. Access: dataset. */
export const sentinel_hub_com: SourceSpec = {
  id: "sentinel-hub.com",
  transport: "http",
  url: "https://www.sentinel-hub.com/explore/sentinelplayground",
};

/** USGS EarthExplorer — Authoritative gateway to USGS satellite imagery, aerial photography, and geospatial datasets, downloadable by location. Access: open_api. */
export const usgs_gov: SourceSpec = {
  id: "usgs.gov",
  transport: "http",
  url: "https://earthexplorer.usgs.gov",
};

/** WiGLE — Crowdsourced wardriving database mapping the location, name, and properties of Wi-Fi networks globally. Access: open_api. */
export const wigle_net: SourceSpec = {
  id: "wigle.net",
  transport: "http",
  url: "https://wigle.net",
};
