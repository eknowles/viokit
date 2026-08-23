import type { EvidenceInput } from "@viokit/schema";
import {
  AddEntity,
  AddRelation,
  Entity,
  entityId,
  Identifier,
  PackManifest,
  RegisteredTransform,
  Relation,
  relationId,
  type SourceSpec,
  SpatialExtent,
  TemporalExtent,
  TransformSpec,
} from "@viokit/schema";
import { Schema } from "effect";
import {
  archive_org,
  bgpview_io,
  crt_sh,
  dnsviz_net,
  domaintools_com,
  lookup_icann_org,
  robtex_com,
  securitytrails_com,
  urlscan_io,
} from "./sources.js";

/**
 * The `web-dns` pack's contribution to the runtime catalog. Registration is
 * explicit: a deployment that does not register this manifest does not see
 * these sources or transforms, even though the files exist.
 *
 * Domain content lives here, not in core (open-domain rule): the entity kinds
 * (`domain`, `certificate`), the relation type, and the projection that derives
 * them are all pack-owned.
 */

const sources: readonly SourceSpec[] = [
  archive_org,
  bgpview_io,
  crt_sh,
  dnsviz_net,
  domaintools_com,
  lookup_icann_org,
  robtex_com,
  securitytrails_com,
  urlscan_io,
];

/** What a caller passes to the transform. Published to agents as JSON Schema. */
const CertificateSearchInput = Schema.Struct({
  domain: Schema.String,
});

/** What the transform derives: the domain and the certificates seen for it. */
const CertificateSearchOutput = Schema.Struct({
  certificateCount: Schema.Number,
  domain: Schema.String,
});

const unbounded = TemporalExtent.make({
  validFrom: new Date(0),
  validTo: new Date("9999-12-31T00:00:00.000Z"),
});

const unlocated = SpatialExtent.make({ lat: 0, lon: 0 });

/**
 * Projects a crt.sh acquisition into graph operations: the queried domain as an
 * entity, the certificate-transparency observation as a certificate entity, and
 * the relation between them. Every operation is attributed to the run's
 * evidence by the transform runner (I2) — the projection never fabricates.
 */
const projectCertificates = (
  _evidence: EvidenceInput,
  input: unknown
): readonly (AddEntity | AddRelation)[] => {
  const { domain } = input as { readonly domain: string };
  // Stable across runs: the same domain yields the same certificate vertex, so
  // repeated acquisitions accumulate evidence against one entity rather than
  // forking a new one each time.
  const certificate = `cert:${domain}`;

  return [
    AddEntity.make({
      entity: Entity.make({
        id: entityId(domain),
        identifiers: [Identifier.make({ kind: "domain", value: domain })],
        kind: "domain",
        spatialExtent: unlocated,
        temporalExtent: unbounded,
      }),
    }),
    AddEntity.make({
      entity: Entity.make({
        id: entityId(certificate),
        identifiers: [
          Identifier.make({ kind: "ct-log-entry", value: certificate }),
        ],
        kind: "certificate",
        spatialExtent: unlocated,
        temporalExtent: unbounded,
      }),
    }),
    AddRelation.make({
      relation: Relation.make({
        id: relationId(`${domain}->${certificate}`),
        sourceId: entityId(domain),
        targetId: entityId(certificate),
        temporalExtent: unbounded,
        type: "presents-certificate",
      }),
    }),
  ];
};

const certificateSearch = TransformSpec.make({
  archetype: "search",
  id: "crt-sh-certificate-search",
  input: CertificateSearchInput,
  output: CertificateSearchOutput,
  projection: "steps",
  sourceId: crt_sh.id,
});

export const manifest = PackManifest.make({
  pack: "web-dns",
  sources,
  transforms: [
    RegisteredTransform.make({
      project: projectCertificates,
      source: crt_sh,
      spec: certificateSearch,
    }),
  ],
});
