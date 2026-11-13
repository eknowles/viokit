/**
 * The shared vocabulary: the entity kinds and relation types that packs may
 * use. One list, so tools written independently by different agents produce
 * entities that connect in the same investigation tree instead of duplicating
 * each other (`domain`, `hostname` and `fqdn` are one kind here).
 *
 * Only a steward change may edit this file (the held-out guard enforces it).
 * A tool agent that needs a new name asks for it and keeps working against a
 * stub; see README.md.
 *
 * Names were informed by the event types of SpiderFoot (MIT licence, copyright
 * Steve Micallef), trimmed to what Viokit uses and renamed to this repository's
 * hyphenated style. Nothing is copied from it.
 */

export interface VocabularyEntry {
  readonly description: string;
  readonly name: string;
}

/** Entity kinds. `domain` is any DNS name: the relation carries the role. */
export const entityKinds = [
  {
    description:
      "A DNS name of any kind: a registered domain, a subdomain, a host name, a name server or a mail exchanger. The relation says the role.",
    name: "domain",
  },
  {
    description: "An IPv4 or IPv6 address.",
    name: "ip-address",
  },
  {
    description: "A CIDR block of IP addresses.",
    name: "netblock",
  },
  {
    description: "An autonomous system, identified by its AS number.",
    name: "asn",
  },
  {
    description: "A TLS certificate, identified by its fingerprint or serial.",
    name: "certificate",
  },
  {
    description:
      "A network port observed open on an IP address, with its protocol.",
    name: "open-port",
  },
  {
    description:
      "A software product or version observed on a service or web page.",
    name: "technology",
  },
  {
    description: "A company, institution or other organisation.",
    name: "organization",
  },
  {
    description: "An email address.",
    name: "email-address",
  },
  {
    description: "A URL: the address of a web page or other web resource.",
    name: "url",
  },
] as const satisfies readonly VocabularyEntry[];

/** Relation types, read as "source <type> target". */
export const relationTypes = [
  {
    description: "A domain's address record points at an IP address.",
    name: "resolves-to",
  },
  {
    description: "A domain is an alias (CNAME) for another domain.",
    name: "alias-of",
  },
  {
    description: "A zone is delegated to a name server (a domain).",
    name: "delegated-to",
  },
  {
    description: "A domain has a subdomain.",
    name: "has-subdomain",
  },
  {
    description: "A domain's mail is handled by another domain (an MX record).",
    name: "serves-mail-for",
  },
  {
    description: "A certificate was issued for a domain.",
    name: "issued-for",
  },
  {
    description:
      "An IP address, netblock or domain is owned or registered by an organization.",
    name: "owned-by",
  },
  {
    description: "A netblock is announced by an autonomous system.",
    name: "announced-by",
  },
  {
    description: "An IP address lies within a netblock.",
    name: "within",
  },
  {
    description: "An IP address hosts an open port.",
    name: "hosts",
  },
  {
    description: "An open port runs a technology.",
    name: "runs",
  },
  {
    description:
      "An email address is the contact for a domain or an organization.",
    name: "contact-for",
  },
  {
    description: "A URL links to a domain or to another URL.",
    name: "links-to",
  },
] as const satisfies readonly VocabularyEntry[];

export type EntityKind = (typeof entityKinds)[number]["name"];
export type RelationType = (typeof relationTypes)[number]["name"];

export const entityKindNames: ReadonlySet<string> = new Set(
  entityKinds.map((entry) => entry.name)
);
export const relationTypeNames: ReadonlySet<string> = new Set(
  relationTypes.map((entry) => entry.name)
);
