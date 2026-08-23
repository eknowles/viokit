import { PackManifest } from "@viokit/schema";
import {
  acleddata_com,
  malpedia_caad_fkie_fraunhofer_de,
  otx_alienvault_com,
  pcr_uu_se,
  urlhaus_abuse_ch,
} from "./sources.js";

/**
 * The `conflict-security` pack. Conflict and threat-intelligence sources. One needs a key and one is a
 * dataset download; the rest declare open APIs — declarations this deployment
 * can now check with `verify_access`.
 *
 * Registration is explicit: without this manifest the sources in this pack
 * exist as files and are invisible to every deployment.
 */
export const manifest = PackManifest.make({
  pack: "conflict-security",
  sources: [
    acleddata_com,
    malpedia_caad_fkie_fraunhofer_de,
    otx_alienvault_com,
    pcr_uu_se,
    urlhaus_abuse_ch,
  ],
  transforms: [],
});
