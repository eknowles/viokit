import { PackManifest } from "@viokit/schema";
import { dehashed_com, haveibeenpwned_com, virustotal_com } from "./sources.js";

/**
 * The `data-breaches` pack. Breach and malware-intelligence sources. One requires a credential, so it
 * reports as not runnable until a secret is provisioned for it (TDR-018).
 *
 * Registration is explicit: without this manifest the sources in this pack
 * exist as files and are invisible to every deployment.
 */
export const manifest = PackManifest.make({
  pack: "data-breaches",
  sources: [dehashed_com, haveibeenpwned_com, virustotal_com],
  transforms: [],
});
