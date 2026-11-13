import type { AddEntity, AddRelation, EvidenceInput } from "@viokit/schema";
import { domainEntity, entityOfKind, keyOf, linked } from "./graph.js";

/**
 * `whois` output, as text: `Key: value` lines. Registries differ, so this
 * reads the few keys that mean the same thing across them and ignores the rest.
 * What it derives:
 *   - name servers        -> a domain each, `delegated-to` from the queried domain
 *   - registrant organization -> an organization, `owned-by`
 *   - registrant / admin / tech emails -> an email address, `contact-for`
 * Fields a registry has redacted derive nothing. No recognised field derives
 * nothing at all: a "no match" answer is not a finding.
 */

const decode = new TextDecoder();
const TRAILING_DOT = /\.$/;
const WHITESPACE = /\s+/;
const REDACTED =
  /redacted|privacy|not disclosed|data protected|withheld|please query|^-+$|^n\/a$/i;
const NAME_SERVER_KEYS = new Set(["name server", "nserver", "nameserver"]);
const ORGANIZATION_KEYS = new Set([
  "registrant organization",
  "registrant organisation",
  "orgname",
  "org-name",
]);
const EMAIL_KEYS = new Set(["registrant email", "admin email", "tech email"]);

const usable = (value: string): boolean =>
  value !== "" && !REDACTED.test(value);

const keyValue = (line: string): readonly [string, string] | undefined => {
  const colon = line.indexOf(":");
  if (colon === -1) {
    return;
  }
  return [
    line.slice(0, colon).trim().toLowerCase(),
    line.slice(colon + 1).trim(),
  ];
};

export const projectWhois = (
  evidence: EvidenceInput,
  input: unknown
): readonly (AddEntity | AddRelation)[] => {
  const { domain } = input as { readonly domain: string };
  const nameServers = new Set<string>();
  const organizations = new Set<string>();
  const emails = new Set<string>();

  for (const line of decode.decode(evidence.bytes).split("\n")) {
    const pair = keyValue(line);
    if (pair === undefined) {
      continue;
    }
    const [key, value] = pair;
    if (NAME_SERVER_KEYS.has(key) && usable(value)) {
      // Registries list a name server's addresses after it; the name is first.
      const [name = ""] = value.split(WHITESPACE);
      nameServers.add(name.toLowerCase().replace(TRAILING_DOT, ""));
    } else if (ORGANIZATION_KEYS.has(key) && usable(value)) {
      organizations.add(value);
    } else if (EMAIL_KEYS.has(key) && usable(value) && value.includes("@")) {
      emails.add(value.toLowerCase());
    }
  }

  const operations: (AddEntity | AddRelation)[] = [];
  for (const nameServer of [...nameServers].sort()) {
    operations.push(
      domainEntity(nameServer),
      linked(domain, nameServer, "delegated-to")
    );
  }
  for (const organization of [...organizations].sort()) {
    const key = keyOf("organization", organization);
    operations.push(
      entityOfKind("organization", key, organization),
      linked(domain, key, "owned-by")
    );
  }
  for (const email of [...emails].sort()) {
    const key = keyOf("email-address", email);
    operations.push(
      entityOfKind("email-address", key, email),
      linked(key, domain, "contact-for")
    );
  }
  return operations.length === 0
    ? operations
    : [domainEntity(domain), ...operations];
};
