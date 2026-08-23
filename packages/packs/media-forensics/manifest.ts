import { PackManifest } from "@viokit/schema";
import { suncalc_org } from "./sources.js";

/**
 * The `media-forensics` pack. A single chronolocation aid, and the one browser-only source outside
 * `people-identity`. It is registered though it needs a browser: a source an
 * investigator cannot reach is still one they should know exists.
 *
 * Registration is explicit: without this manifest the sources in this pack
 * exist as files and are invisible to every deployment.
 */
export const manifest = PackManifest.make({
  pack: "media-forensics",
  sources: [suncalc_org],
  transforms: [],
});
