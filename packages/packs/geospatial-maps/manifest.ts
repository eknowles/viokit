import { PackManifest } from "@viokit/schema";
import {
  geonames_org,
  openstreetmap_org,
  sentinel_hub_com,
  usgs_gov,
  wigle_net,
} from "./sources.js";

/**
 * The `geospatial-maps` pack. Place, imagery, and wireless-geolocation sources.
 *
 * Registration is explicit: without this manifest the sources in this pack
 * exist as files and are invisible to every deployment.
 */
export const manifest = PackManifest.make({
  pack: "geospatial-maps",
  sources: [
    geonames_org,
    openstreetmap_org,
    sentinel_hub_com,
    usgs_gov,
    wigle_net,
  ],
  transforms: [],
});
