/**
 * Archetypes from the OSINT landscape (stable transform shapes). See
 * `openspec/exploration/02-osint-landscape.md` §1.
 */
export const archetypes = [
  "lookup",
  "search",
  "resolve",
  "geolocate",
  "chronolocate",
  "correlate",
  "monitor",
  "extract",
  "archive",
  "analyze",
] as const;

/**
 * Category slugs (pack names) from the OSINT landscape catalog §2. The work
 * queue is seeded as `category × archetype` so the swarm partitions coverage.
 */
export const categories = [
  "corporate-finance",
  "people-identity",
  "social",
  "web-dns",
  "geospatial-maps",
  "imagery",
  "media-forensics",
  "transport",
  "environment",
  "conflict-security",
  "data-breaches",
  "crypto-finance",
  "infra-devices",
  "travel-border",
] as const;

/** The `{category, archetype}` discovery grid agents partition via claims. */
export const discoveryUnits: ReadonlyArray<{
  readonly category: string;
  readonly archetype: string;
}> = categories.flatMap((category) =>
  archetypes.map((archetype) => ({ archetype, category }))
);
