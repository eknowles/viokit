import { describe, expect, it } from "vitest";
import type { Curation } from "../src/case-table.js";
import {
  caseRows,
  curate,
  kindSlots,
  matches,
  prune,
  summarise,
} from "../src/case-table.js";
import type { GraphSnapshot } from "../src/graph-layout.js";
import type { StepRecord } from "../src/provenance.js";

const entity = (id: string, kind: string, value?: string) => ({
  id,
  identifiers: value === undefined ? [] : [{ kind, value }],
  kind,
  temporalExtent: { validFrom: "1970-01-01", validTo: "9999-12-31" },
});

const relation = (id: string, sourceId: string, targetId: string) => ({
  id,
  sourceId,
  targetId,
  temporalExtent: { validFrom: "1970-01-01", validTo: "9999-12-31" },
  type: "linked",
});

const graph = (
  entities: readonly ReturnType<typeof entity>[],
  relations: readonly ReturnType<typeof relation>[] = []
): GraphSnapshot => ({ entities, relations });

const added = (
  id: string,
  sourceId?: string,
  transformId?: string
): StepRecord => ({
  evidenceIds: ["ev1"],
  id: `step-${id}-${sourceId ?? "none"}`,
  operation: { _tag: "AddEntity", entity: { id } },
  ...(sourceId === undefined ? {} : { sourceId }),
  ...(transformId === undefined ? {} : { transformId }),
});

const related = (from: string, to: string): StepRecord => ({
  evidenceIds: ["ev1"],
  id: `step-${from}-${to}`,
  operation: {
    _tag: "AddRelation",
    relation: { id: `${from}->${to}`, sourceId: from, targetId: to },
  },
  sourceId: "crt.sh",
});

describe("what is in the case", () => {
  it("counts distinct sources, not repeated assertions from one", () => {
    const rows = caseRows(
      graph([entity("a", "domain")]),
      [
        added("a", "crt.sh", "crt-sh-certificate-search"),
        added("a", "crt.sh", "crt-sh-certificate-search"),
        added("a", "host.io", "host-io-domain-record"),
      ],
      {}
    );
    expect(rows[0]?.corroboration).toBe(2);
    expect(rows[0]?.sources).toEqual(["crt.sh", "host.io"]);
    expect(rows[0]?.transforms).toEqual([
      "crt-sh-certificate-search",
      "host-io-domain-record",
    ]);
  });

  it("counts a relation against both of its ends", () => {
    const rows = caseRows(
      graph(
        [entity("a", "domain"), entity("b", "domain"), entity("c", "domain")],
        [relation("r1", "a", "b"), relation("r2", "a", "c")]
      ),
      [],
      {}
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get("a")?.degree).toBe(2);
    expect(byId.get("b")?.degree).toBe(1);
  });

  it("puts the most connected first, and is stable on ties", () => {
    const rows = caseRows(
      graph(
        [entity("z", "domain"), entity("a", "domain"), entity("hub", "domain")],
        [relation("r1", "hub", "a"), relation("r2", "hub", "z")]
      ),
      [],
      {}
    );
    expect(rows.map((row) => row.id)).toEqual(["hub", "a", "z"]);
  });

  it("records where an entity first appeared in the log, not where it last did", () => {
    const rows = caseRows(
      graph([entity("a", "domain")]),
      [added("b", "crt.sh"), added("a", "crt.sh"), added("a", "host.io")],
      {}
    );
    expect(rows[0]?.seenAt).toBe(1);
  });

  it("flags only what arrived in the latest expansion", () => {
    const steps = [added("a", "crt.sh"), added("b", "crt.sh")];
    const rows = caseRows(
      graph([entity("a", "domain"), entity("b", "domain")]),
      steps,
      {},
      1
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get("a")?.fresh).toBe(false);
    expect(byId.get("b")?.fresh).toBe(true);
  });

  it("flags nothing when no expansion has happened yet", () => {
    const rows = caseRows(
      graph([entity("a", "domain")]),
      [added("a", "crt.sh")],
      {}
    );
    expect(rows[0]?.fresh).toBe(false);
  });

  it("attributes a relation step to both endpoints", () => {
    const rows = caseRows(
      graph([entity("a", "domain"), entity("b", "domain")]),
      [related("a", "b")],
      {}
    );
    expect(rows.every((row) => row.sources.includes("crt.sh"))).toBe(true);
  });

  it("takes the display value from the identifier, falling back to the id", () => {
    const rows = caseRows(
      graph([entity("e1", "domain", "acme.example"), entity("bare", "ip")]),
      [],
      {}
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get("e1")?.value).toBe("acme.example");
    expect(byId.get("bare")?.value).toBe("bare");
  });
});

describe("curation", () => {
  it("defaults to unreviewed and reads decisions back", () => {
    const rows = caseRows(
      graph([entity("a", "domain"), entity("b", "domain")]),
      [],
      { a: "discarded" }
    );
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get("a")?.state).toBe("discarded");
    expect(byId.get("b")?.state).toBe("new");
  });

  it("undoes a decision by setting it back to new", () => {
    const once: Curation = curate({}, "a", "discarded");
    expect(once).toEqual({ a: "discarded" });
    expect(curate(once, "a", "new")).toEqual({});
  });

  it("does not mutate the curation it was given", () => {
    const before: Curation = { a: "kept" };
    curate(before, "b", "discarded");
    expect(before).toEqual({ a: "kept" });
  });

  it("drops decisions about entities this case does not hold", () => {
    expect(
      prune({ a: "kept", gone: "discarded" }, graph([entity("a", "domain")]))
    ).toEqual({ a: "kept" });
  });

  it("filters to one state, or to everything", () => {
    const [row] = caseRows(graph([entity("a", "domain")]), [], {
      a: "discarded",
    });
    expect(row).toBeDefined();
    expect(row && matches(row, "all")).toBe(true);
    expect(row && matches(row, "discarded")).toBe(true);
    expect(row && matches(row, "kept")).toBe(false);
  });
});

describe("the case at a glance", () => {
  const rows = caseRows(
    graph(
      [
        entity("a", "domain"),
        entity("b", "domain"),
        entity("ip1", "ip-address"),
      ],
      [relation("r1", "a", "b")]
    ),
    [added("a", "crt.sh"), added("a", "host.io"), added("b", "crt.sh")],
    { a: "kept", b: "discarded" }
  );

  it("says what the case is made of", () => {
    const summary = summarise(rows, 1);
    expect(summary.total).toBe(3);
    expect(summary.byKind).toEqual([
      { count: 2, name: "domain" },
      { count: 1, name: "ip-address" },
    ]);
    expect(summary.bySource).toEqual([
      { count: 2, name: "crt.sh" },
      { count: 1, name: "host.io" },
    ]);
  });

  it("counts what has been decided and what has not", () => {
    const summary = summarise(rows, 1);
    expect(summary.kept).toBe(1);
    expect(summary.discarded).toBe(1);
    expect(summary.unreviewed).toBe(1);
    expect(summary.corroborated).toBe(1);
  });

  it("gives each kind a stable colour slot, wrapping past the palette", () => {
    const many = caseRows(
      graph(
        ["k1", "k2", "k3", "k4", "k5", "k6", "k7"].map((kind, index) =>
          entity(`e${index}`, kind)
        )
      ),
      [],
      {}
    );
    const slots = kindSlots(many);
    expect(slots.get("k1")).toBe(0);
    expect(slots.get("k6")).toBe(5);
    expect(slots.get("k7")).toBe(0);
    // Same input, same paint — twice.
    expect([...kindSlots(many)]).toEqual([...slots]);
  });
});
