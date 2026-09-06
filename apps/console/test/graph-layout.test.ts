import { assert, describe, it } from "vitest";
import type {
  GraphEntity,
  GraphRelation,
  GraphSnapshot,
} from "../src/graph-layout.js";
import {
  atTime,
  capped,
  DEFAULT_NODE_CAP,
  extentRange,
  layout,
} from "../src/graph-layout.js";

const extent = (from: string, to: string) => ({ validFrom: from, validTo: to });

const entity = (
  id: string,
  from = "2024-01-01T00:00:00.000Z",
  to = "2024-12-31T00:00:00.000Z"
): GraphEntity => ({ id, kind: "domain", temporalExtent: extent(from, to) });

const relation = (
  id: string,
  sourceId: string,
  targetId: string,
  from = "2024-01-01T00:00:00.000Z",
  to = "2024-12-31T00:00:00.000Z"
): GraphRelation => ({
  id,
  sourceId,
  targetId,
  temporalExtent: extent(from, to),
  type: "resolves-to",
});

const snapshot = (
  entities: GraphEntity[],
  relations: GraphRelation[] = []
): GraphSnapshot => ({ entities, relations });

const at = (iso: string) => Date.parse(iso);

describe("layout", () => {
  it("places every node and connects every edge", () => {
    const result = layout(
      snapshot(
        [entity("a"), entity("b"), entity("c")],
        [relation("r1", "a", "b"), relation("r2", "b", "c")]
      )
    );
    assert.strictEqual(result.nodes.length, 3);
    assert.strictEqual(result.edges.length, 2);
    assert.isTrue(
      result.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))
    );
  });

  it("is deterministic for a given input", () => {
    const input = snapshot(
      [entity("a"), entity("b"), entity("c")],
      [relation("r1", "a", "b")]
    );
    const first = layout(input);
    const second = layout(input);
    assert.deepStrictEqual(
      first.nodes.map((n) => [n.entity.id, n.x, n.y]),
      second.nodes.map((n) => [n.entity.id, n.x, n.y])
    );
  });

  it("places disconnected nodes too", () => {
    const result = layout(snapshot([entity("lonely")]));
    assert.strictEqual(result.nodes.length, 1);
    assert.isTrue(Number.isFinite(result.nodes[0]?.x));
  });

  it("returns nothing for an empty graph", () => {
    const result = layout(snapshot([]));
    assert.deepStrictEqual(result.nodes, []);
    assert.deepStrictEqual(result.edges, []);
    assert.strictEqual(result.omitted, 0);
  });
});

describe("viewing the graph at a moment", () => {
  const before = entity(
    "before",
    "2020-01-01T00:00:00.000Z",
    "2021-01-01T00:00:00.000Z"
  );
  const during = entity(
    "during",
    "2024-01-01T00:00:00.000Z",
    "2024-12-31T00:00:00.000Z"
  );

  it("excludes what was not yet valid", () => {
    const result = atTime(
      snapshot([before, during]),
      at("2020-06-01T00:00:00.000Z")
    );
    assert.deepStrictEqual(
      result.entities.map((e) => e.id),
      ["before"]
    );
  });

  it("includes what was valid then", () => {
    const result = atTime(
      snapshot([before, during]),
      at("2024-06-01T00:00:00.000Z")
    );
    assert.deepStrictEqual(
      result.entities.map((e) => e.id),
      ["during"]
    );
  });

  it("includes the boundaries of an extent", () => {
    const result = atTime(snapshot([during]), at("2024-01-01T00:00:00.000Z"));
    assert.strictEqual(result.entities.length, 1);
  });

  it("shows everything when no time is selected", () => {
    const result = atTime(snapshot([before, during]), null);
    assert.strictEqual(result.entities.length, 2);
  });

  it("drops relations whose endpoints are filtered out", () => {
    const result = atTime(
      snapshot([before, during], [relation("r", "before", "during")]),
      at("2024-06-01T00:00:00.000Z")
    );
    assert.deepStrictEqual(result.relations, []);
  });
});

describe("bounding what the view renders", () => {
  it("reports nothing omitted when the graph fits", () => {
    const { omitted } = capped(snapshot([entity("a"), entity("b")]), 10);
    assert.strictEqual(omitted, 0);
  });

  it("reports how many it omitted", () => {
    const entities = Array.from({ length: 12 }, (_, i) => entity(`e${i}`));
    const { omitted, snapshot: bounded } = capped(snapshot(entities), 5);
    assert.strictEqual(omitted, 7);
    assert.strictEqual(bounded.entities.length, 5);
  });

  it("keeps the most-connected entities", () => {
    const entities = ["hub", "a", "b", "c", "isolated"].map((id) => entity(id));
    const relations = [
      relation("r1", "hub", "a"),
      relation("r2", "hub", "b"),
      relation("r3", "hub", "c"),
    ];
    const { snapshot: bounded } = capped(snapshot(entities, relations), 2);
    assert.include(
      bounded.entities.map((e) => e.id),
      "hub"
    );
    assert.notInclude(
      bounded.entities.map((e) => e.id),
      "isolated"
    );
  });

  it("never keeps an edge whose endpoint was dropped", () => {
    const entities = ["hub", "a", "b"].map((id) => entity(id));
    const { snapshot: bounded } = capped(
      snapshot(entities, [
        relation("r1", "hub", "a"),
        relation("r2", "hub", "b"),
      ]),
      2
    );
    const ids = new Set(bounded.entities.map((e) => e.id));
    assert.isTrue(
      bounded.relations.every((r) => ids.has(r.sourceId) && ids.has(r.targetId))
    );
  });

  it("surfaces truncation through layout, so the view can report it", () => {
    const entities = Array.from({ length: 30 }, (_, i) => entity(`e${i}`));
    const result = layout(snapshot(entities), { cap: 4 });
    assert.strictEqual(result.omitted, 26);
    assert.strictEqual(result.nodes.length, 4);
  });
});

describe("the graph's time span", () => {
  it("spans the earliest and latest extents", () => {
    const range = extentRange(
      snapshot([
        entity("a", "2020-01-01T00:00:00.000Z", "2021-01-01T00:00:00.000Z"),
        entity("b", "2024-01-01T00:00:00.000Z", "2025-01-01T00:00:00.000Z"),
      ])
    );
    assert.strictEqual(range?.from, at("2020-01-01T00:00:00.000Z"));
    assert.strictEqual(range?.to, at("2025-01-01T00:00:00.000Z"));
  });

  it("is absent for an empty graph", () => {
    assert.isNull(extentRange(snapshot([])));
  });
});

describe("events in the graph", () => {
  const event = (
    id: string,
    entityIds: string[],
    from = "2024-01-01T00:00:00.000Z",
    to = "2024-12-31T00:00:00.000Z"
  ) => ({ entityIds, id, kind: "sighting", temporalExtent: extent(from, to) });

  it("draws an event connected to the entities it involves", () => {
    const result = layout({
      entities: [entity("a"), entity("b")],
      events: [event("ev1", ["a", "b"])],
      relations: [],
    });
    const eventNode = result.nodes.find((n) => n.kind === "event");
    assert.isDefined(eventNode);
    assert.strictEqual(eventNode?.entity.id, "ev1");
    // One edge to each participant.
    assert.strictEqual(result.edges.length, 2);
  });

  it("distinguishes events from entities", () => {
    const result = layout({
      entities: [entity("a")],
      events: [event("ev1", ["a"])],
      relations: [],
    });
    assert.deepStrictEqual(result.nodes.map((n) => n.kind).sort(), [
      "entity",
      "event",
    ]);
  });

  it("excludes an event outside the selected moment", () => {
    const filtered = atTime(
      {
        entities: [entity("a")],
        events: [
          event(
            "old",
            ["a"],
            "2020-01-01T00:00:00.000Z",
            "2020-06-01T00:00:00.000Z"
          ),
          event("now", ["a"]),
        ],
        relations: [],
      },
      Date.parse("2024-06-01T00:00:00.000Z")
    );
    assert.deepStrictEqual(
      filtered.events?.map((e) => e.id),
      ["now"]
    );
  });

  it("a graph without events behaves as before", () => {
    const result = layout(
      snapshot([entity("a"), entity("b")], [relation("r", "a", "b")])
    );
    assert.strictEqual(result.nodes.length, 2);
    assert.isTrue(result.nodes.every((n) => n.kind === "entity"));
  });
});

describe("the render bound", () => {
  const many = (count: number) =>
    snapshot(Array.from({ length: count }, (_, i) => entity(`e${i}`)));

  it("draws a graph that fits without reporting truncation", () => {
    const { omitted } = layout(many(DEFAULT_NODE_CAP), { size: 600 });
    assert.equal(omitted, 0);
  });

  it("still reports truncation at the configured bound, whatever it is", () => {
    // Written against DEFAULT_NODE_CAP rather than a literal: raising the
    // number must not be able to quietly disarm the report.
    const { omitted } = layout(many(DEFAULT_NODE_CAP + 25), { size: 600 });
    assert.equal(omitted, 25);
  });

  it("reports at the old bound too, so raising it did not disable anything", () => {
    const { omitted } = layout(many(250), { cap: 200, size: 600 });
    assert.equal(omitted, 50);
  });

  it("was actually raised — a real one-hop expansion now fits", () => {
    // Measured 2026-08-26: crt.sh on stripe.com projects to 188 entities.
    const { omitted } = layout(many(188), { size: 600 });
    assert.equal(omitted, 0, "a real expansion should no longer be truncated");
  });

  it("keeps the most connected when it does truncate", () => {
    const entities = Array.from({ length: 5 }, (_, i) => entity(`e${i}`));
    const relations = [
      relation("r1", "e0", "e1"),
      relation("r2", "e0", "e2"),
      relation("r3", "e0", "e3"),
    ];
    const { snapshot: bounded } = capped(snapshot(entities, relations), 2);
    assert.include(
      bounded.entities.map((one) => one.id),
      "e0"
    );
  });
});

describe("room for labels", () => {
  /** A label runs to the right of its marker; this is roughly its box. */
  const labelBox = (node: {
    entity: { id: string };
    x: number;
    y: number;
  }) => ({
    x1: node.x + 7 + 8,
    x2: node.x + 7 + 8 + node.entity.id.length * 6,
    y1: node.y - 6,
    y2: node.y + 6,
  });

  const clash = (
    a: ReturnType<typeof labelBox>,
    b: ReturnType<typeof labelBox>
  ) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

  const fanOut = (count: number) => {
    const leaves = Array.from(
      { length: count },
      (_, n) => `service-${n}.acme-intel.example`
    );
    return snapshot(
      [entity("acme-intel.example"), ...leaves.map((id) => entity(id))],
      leaves.map((id, n) => relation(`r${n}`, "acme-intel.example", id))
    );
  };

  it("separates nodes by more than their markers", () => {
    // The node marker is 14px across. Packing to that leaves the labels —
    // which are most of what is actually read — on top of one another.
    const placed = layout(fanOut(40), { size: 600 });
    let nearest = Number.POSITIVE_INFINITY;
    for (const [i, a] of placed.nodes.entries()) {
      for (const b of placed.nodes.slice(i + 1)) {
        nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    assert.isAbove(nearest, 60, "nodes are packed too tightly to read");
  });

  it("leaves labels legible on a graph the size of a real expansion", () => {
    const placed = layout(fanOut(90), { size: 600 });
    const boxes = placed.nodes.map(labelBox);
    const clashes = boxes.reduce(
      (total, a, i) =>
        total + boxes.slice(i + 1).filter((b) => clash(a, b)).length,
      0
    );
    // Measured at 120 before labels were part of the layout's footprint.
    assert.isBelow(clashes, 6, `${clashes} labels overlap each other`);
  });

  it("does not let one long label blow the graph apart", () => {
    const long = `${"x".repeat(200)}.example`;
    const placed = layout(
      snapshot(
        [entity("root.example"), entity(long)],
        [relation("r", "root.example", long)]
      ),
      { size: 600 }
    );
    const [a, b] = placed.nodes;
    assert.isDefined(a);
    assert.isDefined(b);
    assert.isBelow(
      Math.hypot(a.x - b.x, a.y - b.y),
      600,
      "one outlier label should be capped, not spaced for in full"
    );
  });
});
