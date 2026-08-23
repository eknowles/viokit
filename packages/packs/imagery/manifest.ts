import { PackManifest } from "@viokit/schema";
import { mapillary_com, zoom_earth } from "./sources.js";

/**
 * The `imagery` pack. Street-level and satellite imagery sources.
 *
 * Registration is explicit: without this manifest the sources in this pack
 * exist as files and are invisible to every deployment.
 */
export const manifest = PackManifest.make({
  pack: "imagery",
  sources: [mapillary_com, zoom_earth],
  transforms: [],
});
