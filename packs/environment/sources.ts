import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). `access` records
// how the source is reached — the catalog derives runnability from it, so a
// browser-only or key-gated source is reported as unusable rather than
// advertised alongside ones the engine can actually acquire.

/** WHO Global Health Observatory — Authoritative health and environment statistics dataset from the World Health Organization. */
export const who_int: SourceSpec = {
  access: "dataset",
  id: "who.int",
  transport: "http",
  url: "https://www.who.int/data/gho",
};
