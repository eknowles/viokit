import { readFileSync } from "node:fs";
import { assert, describe, it } from "@effect/vitest";
import { manifest } from "@viokit/packs/web-dns/manifest";
import type { EvidenceInput, StepOperation } from "@viokit/schema";
import { Live } from "@viokit/schema";

/**
 * The whois and nmap projections, from output captured by running the tools in
 * the sidecar (fixtures/). No whois or nmap binary is needed to run these.
 */

const projectionOf = (id: string) => {
  const registered = manifest.transforms.find((one) => one.spec.id === id);
  assert.isDefined(registered, `no transform registered as '${id}'`);
  return registered?.project as (
    evidence: EvidenceInput,
    input: unknown
  ) => readonly StepOperation[];
};

const captured = (body: string): EvidenceInput => ({
  acquiredAt: new Date("2026-11-13T00:00:00.000Z"),
  acquisitionPath: Live.make({}),
  bytes: new TextEncoder().encode(body),
  contentType: "text/plain",
  observedAt: new Date("2026-11-13T00:00:00.000Z"),
});

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const entities = (ops: readonly StepOperation[]) =>
  ops
    .filter((op) => op._tag === "AddEntity")
    .map((op) => {
      const { entity } = op as { entity: { id: string; kind: string } };
      return `${entity.kind}:${entity.id}`;
    });

const relations = (ops: readonly StepOperation[]) =>
  ops
    .filter((op) => op._tag === "AddRelation")
    .map((op) => {
      const { relation } = op as {
        relation: { sourceId: string; targetId: string; type: string };
      };
      return `${relation.sourceId} ${relation.type} ${relation.targetId}`;
    });

describe("whois projection", () => {
  const project = projectionOf("whois-registration");

  it("derives the name servers from a real registry record", () => {
    const ops = project(captured(fixture("whois-example-com.txt")), {
      domain: "example.com",
    });
    assert.deepStrictEqual(relations(ops), [
      "example.com delegated-to elliott.ns.cloudflare.com",
      "example.com delegated-to hera.ns.cloudflare.com",
    ]);
    assert.include(entities(ops), "domain:example.com");
    assert.include(entities(ops), "domain:elliott.ns.cloudflare.com");
  });

  it("reads a registrant organization and contact emails, skipping redactions", () => {
    const record = [
      "Domain Name: EXAMPLE.ORG",
      "Registrant Organization: Example Holdings Ltd",
      "Registrant Email: Hostmaster@Example.org",
      "Admin Email: REDACTED FOR PRIVACY",
      "Tech Email: Please query the RDDS service of the Registrar",
      "Name Server: NS1.EXAMPLE.ORG 192.0.2.1",
    ].join("\n");
    const ops = project(captured(record), { domain: "example.org" });
    assert.deepStrictEqual(relations(ops).sort(), [
      "email-address:hostmaster@example.org contact-for example.org",
      "example.org delegated-to ns1.example.org",
      "example.org owned-by organization:Example Holdings Ltd",
    ]);
  });

  it("derives nothing from a no-match answer", () => {
    assert.strictEqual(
      project(captured('No match for domain "NOPE.EXAMPLE".\n'), {
        domain: "nope.example",
      }).length,
      0
    );
  });
});

describe("nmap projection", () => {
  const project = projectionOf("nmap-open-ports");

  it("derives open ports and their technologies from a real scan", () => {
    const ops = project(captured(fixture("nmap-scanme.xml")), {
      ip: "45.33.32.156",
    });
    const triples = relations(ops);
    assert.include(triples, "45.33.32.156 hosts open-port:45.33.32.156:22/tcp");
    assert.include(
      triples,
      "open-port:45.33.32.156:80/tcp runs technology:Apache httpd 2.4.7"
    );
    assert.include(entities(ops), "ip-address:45.33.32.156");
    // Every port is the open kind; a closed or filtered port derives nothing.
    for (const triple of triples.filter((one) => one.includes(" hosts "))) {
      assert.include(triple, "open-port:");
    }
  });

  it("meets the dig projection on the same ip-address node", () => {
    const dig = projectionOf("dig-resolve")(
      captured("example.com.\t\t35\tIN\tA\t45.33.32.156\n"),
      { domain: "example.com" }
    );
    const scan = project(captured(fixture("nmap-scanme.xml")), {
      ip: "45.33.32.156",
    });
    const shared = entities(dig).filter((one) => entities(scan).includes(one));
    assert.deepStrictEqual(shared, ["ip-address:45.33.32.156"]);
  });

  it("derives nothing when no port is open", () => {
    const closed =
      '<nmaprun><host><address addr="10.0.0.1" addrtype="ipv4"/><ports><port protocol="tcp" portid="22"><state state="closed"/></port><port protocol="tcp" portid="80"><state state="filtered"/></port></ports></host></nmaprun>';
    assert.strictEqual(project(captured(closed), { ip: "10.0.0.1" }).length, 0);
  });

  it("decodes XML entities in a service banner", () => {
    const xml =
      '<nmaprun><host><address addr="10.0.0.2" addrtype="ipv4"/><ports><port protocol="tcp" portid="8080"><state state="open"/><service name="http" product="Foo &amp; Bar httpd" version="1.0"/></port></ports></host></nmaprun>';
    assert.include(
      relations(project(captured(xml), { ip: "10.0.0.2" })),
      "open-port:10.0.0.2:8080/tcp runs technology:Foo & Bar httpd 1.0"
    );
  });
});
