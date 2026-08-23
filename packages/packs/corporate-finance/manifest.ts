import { PackManifest } from "@viokit/schema";
import {
  case_law,
  opencorporates_com,
  openownership_org,
  sec_gov,
  worldbank_org,
} from "./sources.js";

/**
 * The `corporate-finance` pack. Company, ownership, and filings sources. Three of the five are declared
 * dataset downloads rather than APIs, which is the kind of claim worth
 * verifying before an investigator relies on it.
 *
 * Registration is explicit: without this manifest the sources in this pack
 * exist as files and are invisible to every deployment.
 */
export const manifest = PackManifest.make({
  pack: "corporate-finance",
  sources: [
    case_law,
    opencorporates_com,
    openownership_org,
    sec_gov,
    worldbank_org,
  ],
  transforms: [],
});
