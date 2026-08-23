import { PackManifest } from "@viokit/schema";
import { who_int } from "./sources.js";

/**
 * The `environment` pack. A single environmental-data source, declared as a dataset download.
 *
 * Registration is explicit: without this manifest the sources in this pack
 * exist as files and are invisible to every deployment.
 */
export const manifest = PackManifest.make({
  pack: "environment",
  sources: [who_int],
  transforms: [],
});
