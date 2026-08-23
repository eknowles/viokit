import { assert, describe, it } from "vitest";
import type {
  GraphEntity,
  GraphRelation,
  GraphSnapshot,
} from "../src/graph-layout.js";
import { atTime, capped, extentRange, layout } from "../src/graph-layout.js";

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
