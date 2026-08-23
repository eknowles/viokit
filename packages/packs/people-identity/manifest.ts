import { PackManifest } from "@viokit/schema";
import {
  bop_gov,
  familysearch_org,
  judyrecords_com,
  opensanctions_org,
  voterrecords_com,
} from "./sources.js";

/**
 * The `people-identity` pack. Two of its five sources are browser-only
 * interfaces — a court-record search and a voter-record search — which no
 * transport here can acquire. They are registered anyway: the catalog reports them as
 * present and not runnable, so an investigator knows the source exists and that
 * reaching it needs a person or a browser, rather than finding it missing.
 */
export const manifest = PackManifest.make({
  pack: "people-identity",
  sources: [
    bop_gov,
    familysearch_org,
    judyrecords_com,
    opensanctions_org,
    voterrecords_com,
  ],
  transforms: [],
});
