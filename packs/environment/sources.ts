import type { SourceSpec } from "@viokit/schema";

// Promoted by the source-discovery harness. Add auth/cache/egress policy and a
// projection to make this a runnable source (see PACK_RECIPE). The discovery
// metadata each candidate carried is kept as documentation above its spec.

/** WHO Global Health Observatory — Authoritative health and environment statistics dataset from the World Health Organization. Access: dataset. */
export const who_int: SourceSpec = {
  id: "who.int",
  transport: "http",
  url: "https://www.who.int/data/gho",
};
