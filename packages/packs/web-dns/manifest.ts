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
  host_io,
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
  host_io,
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
/**
 * crt.sh returns an array of certificate log entries, each with `name_value`
 * holding one or more names the certificate covers, newline-separated.
 *
 * This projection used to ignore the response entirely and derive `cert:<domain>`
 * from the input, so it produced the same graph whatever came back. It reads the
 * log now, and certificate transparency is a genuinely good subdomain source:
 * every name anyone has ever requested a certificate for.
 */
const projectCertificates = (
  evidence: EvidenceInput,
  input: unknown
): readonly (AddEntity | AddRelation)[] => {
  const { domain } = input as { readonly domain: string };
  let entries: unknown = null;
  try {
    entries = JSON.parse(decodeBody.decode(evidence.bytes));
  } catch {
    entries = null;
  }

  const names = new Set<string>();
  if (Array.isArray(entries)) {
    for (const entry of entries as Record<string, unknown>[]) {
      const value = entry.name_value;
      if (typeof value !== "string") {
        continue;
      }
      for (const name of value.split("\n")) {
        const trimmed = name.trim().toLowerCase().replace(WILDCARD, "");
        // Wildcards collapse onto the name they cover; anything outside the
        // domain asked about is somebody else's certificate.
        if (trimmed !== "" && trimmed.endsWith(domain)) {
          names.add(trimmed);
        }
      }
    }
  }

  const operations: (AddEntity | AddRelation)[] = [domainEntity(domain)];
  for (const name of [...names].sort()) {
    if (name === domain) {
      continue;
    }
    operations.push(domainEntity(name), linked(domain, name, "has-subdomain"));
  }
  return operations;
};

const certificateSearch = TransformSpec.make({
  archetype: "search",
  id: "crt-sh-certificate-search",
  input: CertificateSearchInput,
  output: CertificateSearchOutput,
  projection: "steps",
  sourceId: crt_sh.id,
});

const decodeBody = new TextDecoder();

/** A leading wildcard label; the certificate covers the name beneath it. */
const WILDCARD = /^\*\./;

/** The response, or nothing if it was not the JSON this source promised. */
const jsonBody = (evidence: EvidenceInput): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(decodeBody.decode(evidence.bytes));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const domainEntity = (name: string) =>
  AddEntity.make({
    entity: Entity.make({
      id: entityId(name),
      identifiers: [Identifier.make({ kind: "domain", value: name })],
      kind: "domain",
      spatialExtent: unlocated,
      temporalExtent: unbounded,
    }),
  });

const linked = (from: string, to: string, type: string) =>
  AddRelation.make({
    relation: Relation.make({
      id: relationId(`${from}->${to}:${type}`),
      sourceId: entityId(from),
      targetId: entityId(to),
      temporalExtent: unbounded,
      type,
    }),
  });

const SubdomainInput = Schema.Struct({ hostname: Schema.String });
const SubdomainOutput = Schema.Struct({
  hostname: Schema.String,
  subdomains: Schema.Array(Schema.String),
});

/**
 * SecurityTrails returns `{subdomains: ["www", "mail", …]}` — labels, not fully
 * qualified names, so each is joined back onto the hostname asked about.
 *
 * Derived from the *response*. The previous transform in this pack derived from
 * its input string and would have produced the same graph whatever came back,
 * which is the failure this pack exists to stop repeating.
 */
const projectSubdomains = (
  evidence: EvidenceInput,
  input: unknown
): readonly (AddEntity | AddRelation)[] => {
  const { hostname } = input as { readonly hostname: string };
  const body = jsonBody(evidence);
  const labels = Array.isArray(body?.subdomains)
    ? (body.subdomains as unknown[]).filter(
        (one): one is string => typeof one === "string" && one !== ""
      )
    : [];

  const operations: (AddEntity | AddRelation)[] = [domainEntity(hostname)];
  for (const label of labels) {
    const fqdn = `${label}.${hostname}`;
    operations.push(
      domainEntity(fqdn),
      linked(hostname, fqdn, "has-subdomain")
    );
  }
  return operations;
};

const DomainRecordInput = Schema.Struct({ domain: Schema.String });
const DomainRecordOutput = Schema.Struct({
  addresses: Schema.Array(Schema.String),
  domain: Schema.String,
});

/**
 * host.io's full record: `{domain, web, dns: {a, ns, mx}, ipinfo, related}`.
 * Only what is actually present is derived — an absent DNS section yields no
 * address, rather than a placeholder that would read as a finding.
 */
const projectDomainRecord = (
  evidence: EvidenceInput,
  input: unknown
): readonly (AddEntity | AddRelation)[] => {
  const { domain } = input as { readonly domain: string };
  const body = jsonBody(evidence);
  const dns = (body?.dns ?? {}) as Record<string, unknown>;
  const strings = (value: unknown): readonly string[] =>
    Array.isArray(value)
      ? value.filter((one): one is string => typeof one === "string")
      : [];

  const operations: (AddEntity | AddRelation)[] = [domainEntity(domain)];

  for (const address of strings(dns.a)) {
    operations.push(
      AddEntity.make({
        entity: Entity.make({
          id: entityId(address),
          identifiers: [Identifier.make({ kind: "ipv4", value: address })],
          kind: "ip-address",
          spatialExtent: unlocated,
          temporalExtent: unbounded,
        }),
      }),
      linked(domain, address, "resolves-to")
    );
  }
  for (const nameserver of strings(dns.ns)) {
    operations.push(
      domainEntity(nameserver),
      linked(domain, nameserver, "delegated-to")
    );
  }
  return operations;
};

const subdomainEnumeration = TransformSpec.make({
  archetype: "search",
  id: "securitytrails-subdomains",
  input: SubdomainInput,
  output: SubdomainOutput,
  projection: "steps",
  sourceId: securitytrails_com.id,
});

const domainRecord = TransformSpec.make({
  archetype: "lookup",
  id: "host-io-domain-record",
  input: DomainRecordInput,
  output: DomainRecordOutput,
  projection: "steps",
  sourceId: host_io.id,
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
    RegisteredTransform.make({
      project: projectSubdomains,
      source: securitytrails_com,
      spec: subdomainEnumeration,
    }),
    RegisteredTransform.make({
      project: projectDomainRecord,
      source: host_io,
      spec: domainRecord,
    }),
  ],
});
