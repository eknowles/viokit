import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert, describe, it } from "@effect/vitest";
import { manifest as conflictManifest } from "@viokit/packs/conflict-security/manifest";
import { manifest as financeManifest } from "@viokit/packs/corporate-finance/manifest";
import { manifest as breachManifest } from "@viokit/packs/data-breaches/manifest";
import { manifest as environmentManifest } from "@viokit/packs/environment/manifest";
import { manifest as geoManifest } from "@viokit/packs/geospatial-maps/manifest";
import { manifest as imageryManifest } from "@viokit/packs/imagery/manifest";
import { manifest as forensicsManifest } from "@viokit/packs/media-forensics/manifest";
import { manifest as peopleManifest } from "@viokit/packs/people-identity/manifest";
import { manifest as transportManifest } from "@viokit/packs/transport/manifest";
import { manifest as webDnsManifest } from "@viokit/packs/web-dns/manifest";

/**
 * Every source a pack ships must be registered by that pack's manifest.
 *
 * This is the check that was missing. Registration is explicit by design, but
 * nothing noticed when only half of it happened: eight packs had no manifest at
 * all and `people-identity` had one nothing registered, so a default deployment
 * saw 9 of 38 promoted sources. The other 29 existed only as files.
 *
 * The manifests are imported statically and the pack directories are read from
 * disk, so a *new* pack without a manifest fails rather than being skipped.
 */
const packModules = {
  "conflict-security": [
    conflictManifest,
    () => import("@viokit/packs/conflict-security/sources"),
  ],
  "corporate-finance": [
    financeManifest,
    () => import("@viokit/packs/corporate-finance/sources"),
  ],
  "data-breaches": [
    breachManifest,
    () => import("@viokit/packs/data-breaches/sources"),
  ],
  environment: [
    environmentManifest,
    () => import("@viokit/packs/environment/sources"),
  ],
  "geospatial-maps": [
    geoManifest,
    () => import("@viokit/packs/geospatial-maps/sources"),
  ],
  imagery: [imageryManifest, () => import("@viokit/packs/imagery/sources")],
  "media-forensics": [
    forensicsManifest,
    () => import("@viokit/packs/media-forensics/sources"),
  ],
  "people-identity": [
    peopleManifest,
    () => import("@viokit/packs/people-identity/sources"),
  ],
  transport: [
    transportManifest,
    () => import("@viokit/packs/transport/sources"),
  ],
  "web-dns": [webDnsManifest, () => import("@viokit/packs/web-dns/sources")],
} as const;

const isSourceSpec = (value: unknown): value is { readonly id: string } =>
  typeof value === "object" &&
  value !== null &&
  "id" in value &&
  "url" in value &&
  "transport" in value;

/** What a pack ships, read from the module rather than from its text. */
const shippedIds = (module: object): readonly string[] =>
  Object.values(module)
    .filter(isSourceSpec)
    .map((spec) => spec.id)
    .sort();

describe("every promoted source is registered by its pack", () => {
  for (const [pack, [manifest, load]] of Object.entries(packModules)) {
    it(`${pack} registers every source it ships`, async () => {
      const registered = manifest.sources.map((spec) => spec.id).sort();
      assert.deepStrictEqual(shippedIds(await load()), registered);
    });
  }

  /** A pack added without a manifest is the case that actually happened. */
  it("covers every pack directory on disk", () => {
    const packsDir = fileURLToPath(new URL("../../packs", import.meta.url));
    const onDisk = readdirSync(packsDir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name !== "node_modules" &&
          existsSync(join(packsDir, entry.name, "sources.ts"))
      )
      .map((entry) => entry.name)
      .sort();
    assert.deepStrictEqual(onDisk, Object.keys(packModules).sort());
  });

  it("registers every promoted source across all packs", () => {
    const total = Object.values(packModules).reduce(
      (sum, [manifest]) => sum + manifest.sources.length,
      0
    );
    assert.strictEqual(total, 38);
  });
});
