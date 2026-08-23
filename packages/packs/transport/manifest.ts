import { PackManifest } from "@viokit/schema";
import { marinetraffic_com, vesselfinder_com } from "./sources.js";

/**
 * The `transport` pack. Vessel-tracking sources.
 *
 * Registration is explicit: without this manifest the sources in this pack
 * exist as files and are invisible to every deployment.
 */
export const manifest = PackManifest.make({
  pack: "transport",
  sources: [marinetraffic_com, vesselfinder_com],
  transforms: [],
});
