import { assert, describe, it } from "@effect/vitest";
import { manifest } from "@viokit/packs/web-dns/manifest";
import type { EvidenceInput, StepOperation } from "@viokit/schema";
import { Live } from "@viokit/schema";

/**
 * The `dig` projection, from output captured with
 * `dig +noall +answer <name> A`: one record per line, tab separated, names
 * fully qualified. No `dig` binary is needed.
 */

const project = (() => {
  const registered = manifest.transforms.find(
    (one) => one.spec.id === "dig-resolve"
  );
  assert.isDefined(registered, "no transform registered as 'dig-resolve'");
  return registered?.project as (
    evidence: EvidenceInput,
    input: unknown
  ) => readonly StepOperation[];
})();

const captured = (body: string): EvidenceInput => ({
  acquiredAt: new Date("2024-06-01T00:00:00.000Z"),
  acquisitionPath: Live.make({}),
  bytes: new TextEncoder().encode(body),
  contentType: "text/plain",
  observedAt: new Date("2024-06-01T00:00:00.000Z"),
});

const entityIds = (ops: readonly StepOperation[]) =>
  ops
    .filter((op) => op._tag === "AddEntity")
    .map((op) => (op as { entity: { id: string } }).entity.id);

const relationTriples = (ops: readonly StepOperation[]) =>
  ops
    .filter((op) => op._tag === "AddRelation")
    .map((op) => {
      const { relation } = op as {
        relation: { sourceId: string; targetId: string; type: string };
      };
      return `${relation.sourceId} ${relation.type} ${relation.targetId}`;
    });

const ANSWER = [
  "example.com.\t\t35\tIN\tA\t172.66.147.243",
  "example.com.\t\t35\tIN\tA\t104.20.23.154",
  "",
].join("\n");

describe("dig answer projection", () => {
  it("yields the domain, each address and a resolves-to relation per address", () => {
    const ops = project(captured(ANSWER), { domain: "example.com" });
    assert.deepStrictEqual(
      [...new Set(entityIds(ops))].sort(),
      ["104.20.23.154", "172.66.147.243", "example.com"].sort()
    );
    assert.deepStrictEqual(relationTriples(ops), [
      "example.com resolves-to 172.66.147.243",
      "example.com resolves-to 104.20.23.154",
    ]);
  });

  it("reads an address from its owner when a CNAME sits in front", () => {
    const ops = project(
      captured(
        [
          "www.example.com.\t300\tIN\tCNAME\tedge.example.net.",
          "edge.example.net.\t60\tIN\tA\t192.0.2.7",
        ].join("\n")
      ),
      { domain: "www.example.com" }
    );
    assert.deepStrictEqual(relationTriples(ops), [
      "www.example.com alias-of edge.example.net",
      "edge.example.net resolves-to 192.0.2.7",
    ]);
  });

  it("derives an ipv6 address from an AAAA record", () => {
    const ops = project(
      captured("example.com.\t35\tIN\tAAAA\t2606:4700::6810:84e5\n"),
      { domain: "example.com" }
    );
    assert.include(entityIds(ops), "2606:4700::6810:84e5");
  });

  it("yields nothing for an empty answer", () => {
    assert.deepStrictEqual(
      project(captured(""), { domain: "nothing.example" }),
      []
    );
    assert.deepStrictEqual(
      project(captured("\n"), { domain: "nothing.example" }),
      []
    );
  });

  it("ignores comment lines and record types it does not read", () => {
    const ops = project(
      captured(
        ';; connection timed out\nexample.com.\t3600\tIN\tTXT\t"v=spf1 -all"\n'
      ),
      { domain: "example.com" }
    );
    assert.deepStrictEqual(ops, []);
  });
});

describe("the dig source declaration", () => {
  const source = manifest.sources.find((one) => one.id === "dig");

  it("is a passive exec source with a typed domain parameter", () => {
    assert.strictEqual(source?.transport, "exec");
    assert.strictEqual(source?.exec?.kind, "passive");
    assert.deepStrictEqual(source?.exec?.args, [
      "+noall",
      "+answer",
      "{domain}",
      "A",
    ]);
    assert.strictEqual(source?.exec?.params[0]?.type, "domain");
  });
});
