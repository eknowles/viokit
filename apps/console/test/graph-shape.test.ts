import { assert, describe, it } from "vitest";
import type {
  GraphEntity,
  GraphRelation,
  GraphSnapshot,
} from "../src/graph-layout.js";
import { layout } from "../src/graph-layout.js";
import {
  isForest,
  LAYOUT_LABELS,
  LAYOUTS,
  suggestLayout,
} from "../src/graph-shape.js";

const extent = {
  validFrom: "2024-01-01T00:00:00.000Z",
  validTo: "2024-12-31T00:00:00.000Z",
};

const entity = (id: string, kind = "domain"): GraphEntity => ({
  id,
  kind,
  temporalExtent: extent,
});

const relation = (
  id: string,
  sourceId: string,
  targetId: string
): GraphRelation => ({
  id,
  sourceId,
  targetId,
  temporalExtent: extent,
  type: "has-subdomain",
});

const snapshot = (
  entities: readonly GraphEntity[],
  relations: readonly GraphRelation[] = []
): GraphSnapshot => ({ entities, relations });

/** What `crt-sh-certificate-search` actually produces: a root fanning out. */
const tree = snapshot(
  [
    entity("a.example"),
    entity("w.a.example"),
    entity("x.a.example"),
    entity("1.1.1.1", "ip-address"),
  ],
  [
    relation("r1", "a.example", "w.a.example"),
    relation("r2", "a.example", "x.a.example"),
    relation("r3", "w.a.example", "1.1.1.1"),
  ]
);

/** Two roots with nothing between them — the multi-root case. */
const forest = snapshot(
  [
    entity("a.example"),
    entity("w.a.example"),
    entity("b.example"),
    entity("p.b.example"),
  ],
  [
    relation("r1", "a.example", "w.a.example"),
    relation("r2", "b.example", "p.b.example"),
  ]
);

/** Two subdomains sharing an address — a cycle, and genuinely not a tree. */
const meshed = snapshot(
  [
    entity("a.example"),
    entity("w.a.example"),
    entity("x.a.example"),
    entity("1.1.1.1", "ip-address"),
  ],
  [
    relation("r1", "a.example", "w.a.example"),
    relation("r2", "a.example", "x.a.example"),
    relation("r3", "w.a.example", "1.1.1.1"),
    relation("r4", "x.a.example", "1.1.1.1"),
  ]
);

describe("isForest", () => {
  it("recognises a single tree", () => {
    assert.isTrue(isForest(tree));
  });

  it("recognises several disconnected trees", () => {
    assert.isTrue(isForest(forest));
  });

  it("recognises isolated nodes as a forest", () => {
    assert.isTrue(isForest(snapshot([entity("a"), entity("b")])));
  });

  it("rejects a graph with a cycle", () => {
    assert.isFalse(isForest(meshed));
  });

  it("counts a link asserted twice once — corroboration is not a cycle", () => {
    const corroborated = snapshot(tree.entities, [
      ...tree.relations,
      // Same pair, different relation id: a second source saying the same
      // thing. Counting it as a second edge would call this a cycle.
      relation("r1-again", "a.example", "w.a.example"),
    ]);
    assert.isTrue(isForest(corroborated));
  });

  it("ignores a relation whose ends are not in the graph", () => {
    const dangling = snapshot(tree.entities, [
      ...tree.relations,
      relation("r-ghost", "a.example", "not-here"),
    ]);
    assert.isTrue(isForest(dangling));
  });
});

describe("suggestLayout", () => {
  it("lays a forest out as a hierarchy", () => {
    assert.equal(suggestLayout(tree), "breadthfirst");
    assert.equal(suggestLayout(forest), "breadthfirst");
  });

  it("leaves a genuinely cross-linked graph to the computed positions", () => {
    assert.equal(suggestLayout(meshed), "preset");
  });

  it("does not reach for a hierarchy when there is nothing to lay out", () => {
    assert.equal(suggestLayout(snapshot([])), "preset");
  });

  it("only ever suggests a layout that is on offer", () => {
    for (const graph of [tree, forest, meshed, snapshot([])]) {
      assert.include(LAYOUTS, suggestLayout(graph));
    }
  });

  it("names every layout it offers — an unlabelled choice is not one", () => {
    for (const name of LAYOUTS) {
      assert.isTrue((LAYOUT_LABELS[name] ?? "").length > 0, name);
    }
  });
});

describe("layout determinism", () => {
  it("gives the same positions for the same graph, twice", () => {
    // The existing tests depend on this, and so does anything that compares a
    // rendered graph across reloads.
    const a = layout(meshed, { size: 600 });
    const b = layout(meshed, { size: 600 });
    assert.deepStrictEqual(
      a.nodes.map((n) => [n.entity.id, n.x, n.y]),
      b.nodes.map((n) => [n.entity.id, n.x, n.y])
    );
  });

  it("places every node somewhere finite", () => {
    for (const node of layout(forest, { size: 600 }).nodes) {
      assert.isTrue(
        Number.isFinite(node.x) && Number.isFinite(node.y),
        `${node.entity.id} is not placed`
      );
    }
  });

  it("does not stack two unrelated components on the same point", () => {
    const placed = layout(forest, { size: 600 });
    const points = placed.nodes.map(
      (n) => `${Math.round(n.x)},${Math.round(n.y)}`
    );
    assert.equal(
      new Set(points).size,
      points.length,
      "two nodes share a position"
    );
  });
});
