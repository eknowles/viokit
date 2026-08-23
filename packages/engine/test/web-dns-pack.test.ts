import { assert, describe, it } from "@effect/vitest";
import { manifest } from "@viokit/packs/web-dns/manifest";
import type { EvidenceInput, StepOperation } from "@viokit/schema";
import { Live } from "@viokit/schema";

/**
 * The `web-dns` projections, against realistic responses.
 *
 * These exist because the pack's original transform derived its output from the
 * _input string_ and would have produced the same graph whatever came back —
 * provenance-complete and content-free. Every assertion here is about reading
 * the response.
 */

const projectionFor = (id: string) => {
  const registered = manifest.transforms.find((one) => one.spec.id === id);
  assert.isDefined(registered, `no transform registered as '${id}'`);
  return registered?.project as (
    evidence: EvidenceInput,
    input: unknown
  ) => readonly StepOperation[];
};

const responded = (body: string): EvidenceInput => ({
  acquiredAt: new Date("2024-06-01T00:00:00.000Z"),
  acquisitionPath: Live.make({}),
  bytes: new TextEncoder().encode(body),
  contentType: "application/json",
  observedAt: new Date("2024-06-01T00:00:00.000Z"),
});

const entities = (ops: readonly StepOperation[]) =>
  ops
    .filter((op) => op._tag === "AddEntity")
    .map((op) => (op as { entity: { id: string } }).entity.id);

const relations = (ops: readonly StepOperation[]) =>
  ops
    .filter((op) => op._tag === "AddRelation")
    .map((op) => (op as { relation: { type: string } }).relation.type);

describe("securitytrails subdomain enumeration", () => {
  const project = projectionFor("securitytrails-subdomains");

  it("joins returned labels onto the hostname asked about", () => {
    const ops = project(
      responded('{"subdomains":["www","api","docs"],"subdomain_count":3}'),
      { hostname: "example.com" }
    );
    assert.deepStrictEqual(entities(ops), [
      "example.com",
      "www.example.com",
      "api.example.com",
      "docs.example.com",
    ]);
    assert.deepStrictEqual(relations(ops), [
      "has-subdomain",
      "has-subdomain",
      "has-subdomain",
    ]);
  });

  /** The failure this pack exists to stop: output that ignores the response. */
  it("derives nothing extra when the response carries no subdomains", () => {
    const ops = project(responded('{"subdomains":[]}'), {
      hostname: "example.com",
    });
    assert.deepStrictEqual(entities(ops), ["example.com"]);
  });

  it("invents nothing when the body is not the JSON promised", () => {
    const ops = project(responded("<html>502 Bad Gateway</html>"), {
      hostname: "example.com",
    });
    assert.deepStrictEqual(entities(ops), ["example.com"]);
  });
});

describe("host.io domain record", () => {
  const project = projectionFor("host-io-domain-record");

  it("derives addresses and nameservers that are actually present", () => {
    const ops = project(
      responded(
        '{"domain":"example.com","dns":{"a":["93.184.216.34"],"ns":["a.iana-servers.net"]}}'
      ),
      { domain: "example.com" }
    );
    assert.deepStrictEqual(entities(ops), [
      "example.com",
      "93.184.216.34",
      "a.iana-servers.net",
    ]);
    assert.deepStrictEqual(relations(ops), ["resolves-to", "delegated-to"]);
  });

  it("derives no address when the record has no DNS section", () => {
    const ops = project(responded('{"domain":"example.com","web":{}}'), {
      domain: "example.com",
    });
    assert.deepStrictEqual(entities(ops), ["example.com"]);
  });
});

describe("crt.sh certificate transparency", () => {
  const project = projectionFor("crt-sh-certificate-search");

  /** `name_value` holds one or more names, newline-separated. */
  it("reads every name a certificate covers", () => {
    const ops = project(
      responded(
        JSON.stringify([
          { name_value: "example.com\nwww.example.com" },
          { name_value: "*.api.example.com" },
        ])
      ),
      { domain: "example.com" }
    );
    // The wildcard collapses onto the name it covers, and the apex is not made
    // a subdomain of itself.
    assert.deepStrictEqual(entities(ops), [
      "example.com",
      "api.example.com",
      "www.example.com",
    ]);
  });

  it("ignores names belonging to somebody else's certificate", () => {
    const ops = project(
      responded(JSON.stringify([{ name_value: "attacker.test" }])),
      { domain: "example.com" }
    );
    assert.deepStrictEqual(entities(ops), ["example.com"]);
  });

  /**
   * crt.sh answered 502 while this was being written, which is exactly when the
   * old projection would have invented a certificate from an error page.
   */
  it("invents nothing from an error page", () => {
    const ops = project(
      responded("<html><head><title>502 Bad Gateway</title></head></html>"),
      { domain: "example.com" }
    );
    assert.deepStrictEqual(entities(ops), ["example.com"]);
  });
});
