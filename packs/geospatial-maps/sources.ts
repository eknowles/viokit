import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). `access` records
// how the source is reached — the catalog derives runnability from it, so a
// browser-only or key-gated source is reported as unusable rather than
// advertised alongside ones the engine can actually acquire.

/** GeoNames — Free global gazetteer database of place names, coordinates, and administrative subdivisions, with a documented REST API. */
export const geonames_org: SourceSpec = {
  access: "open_api",
  id: "geonames.org",
  transport: "http",
  url: "https://www.geonames.org",
};

/** OpenStreetMap — Open collaborative geographic database of the world, with public APIs for map data, geocoding, and routing. */
export const openstreetmap_org: SourceSpec = {
  access: "open_api",
  id: "openstreetmap.org",
  transport: "http",
  url: "https://www.openstreetmap.org",
};

/** Sentinel Hub Playground — Authoritative viewer and API for European Space Agency Sentinel satellite imagery. */
export const sentinel_hub_com: SourceSpec = {
  access: "dataset",
  id: "sentinel-hub.com",
  transport: "http",
  url: "https://www.sentinel-hub.com/explore/sentinelplayground",
};

/** USGS EarthExplorer — Authoritative gateway to USGS satellite imagery, aerial photography, and geospatial datasets, downloadable by location. */
export const usgs_gov: SourceSpec = {
  access: "open_api",
  id: "usgs.gov",
  transport: "http",
  url: "https://earthexplorer.usgs.gov",
};

/** WiGLE — Crowdsourced wardriving database mapping the location, name, and properties of Wi-Fi networks globally. */
export const wigle_net: SourceSpec = {
  access: "open_api",
  id: "wigle.net",
  transport: "http",
  url: "https://wigle.net",
};
