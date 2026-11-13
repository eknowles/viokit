import type { AddEntity, AddRelation, EvidenceInput } from "@viokit/schema";
import { entityOfKind, ipEntity, keyOf, linked } from "./graph.js";

/**
 * `nmap -oX -` output. XML is read with patterns rather than a parser (no
 * dependency): nmap's attribute values are quoted and its element names are
 * stable. What it derives, per open port only:
 *   - an open-port, `hosts`-linked from the IP address
 *   - when service detection named a product, a technology, `runs`-linked from
 *     the port
 * Closed and filtered ports derive nothing, and a scan that found nothing open
 * derives nothing at all: that is not a finding.
 */

const decode = new TextDecoder();
const ADDRESS = /<address addr="([^"]+)" addrtype="(ipv4|ipv6)"/;
const PORT = /<port protocol="([a-z]+)" portid="(\d+)">([\s\S]*?)<\/port>/g;
const STATE_OPEN = /<state state="open"/;
const SERVICE = /<service ([^>]*?)\/?>/;
const ATTRIBUTE = /([a-z]+)="([^"]*)"/g;
const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&apos;": "'",
  "&gt;": ">",
  "&lt;": "<",
  "&quot;": '"',
};
const ENTITY = /&(amp|apos|gt|lt|quot);/g;

const decodeEntities = (value: string): string =>
  value.replace(ENTITY, (match) => ENTITIES[match] ?? match);

const attributes = (text: string): ReadonlyMap<string, string> => {
  const found = new Map<string, string>();
  for (const match of text.matchAll(ATTRIBUTE)) {
    found.set(match[1] ?? "", decodeEntities(match[2] ?? ""));
  }
  return found;
};

export const projectNmap = (
  evidence: EvidenceInput,
  input: unknown
): readonly (AddEntity | AddRelation)[] => {
  const { ip } = input as { readonly ip: string };
  const xml = decode.decode(evidence.bytes);
  const address = ADDRESS.exec(xml);
  const host = address?.[1] ?? ip;
  const identifierKind = address?.[2] ?? "ipv4";

  const operations: (AddEntity | AddRelation)[] = [];
  for (const match of xml.matchAll(PORT)) {
    const [, protocol = "", portId = "", body = ""] = match;
    if (!STATE_OPEN.test(body)) {
      continue;
    }
    const label = `${host}:${portId}/${protocol}`;
    const portKey = keyOf("open-port", label);
    operations.push(
      entityOfKind("open-port", portKey, label),
      linked(host, portKey, "hosts")
    );
    const service = attributes(SERVICE.exec(body)?.[1] ?? "");
    const product = service.get("product");
    if (product !== undefined && product !== "") {
      const version = service.get("version");
      const technology = version ? `${product} ${version}` : product;
      const technologyKey = keyOf("technology", technology);
      operations.push(
        entityOfKind("technology", technologyKey, technology),
        linked(portKey, technologyKey, "runs")
      );
    }
  }
  return operations.length === 0
    ? operations
    : [ipEntity(host, identifierKind), ...operations];
};
