import { assert, describe, it } from "vitest";
import type { CaseRow } from "../src/case-table.js";
import { caseGraphView } from "../src/case-table.js";
import type {
  GraphEntity,
  GraphRelation,
  GraphSnapshot,
} from "../src/graph-layout.js";
import { layout } from "../src/graph-layout.js";
import { graphView, kindsInView, seedNodeView } from "../src/graph-view.js";

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
  type: "resolves-to",
});

const snapshot = (
  entities: GraphEntity[],
  relations: GraphRelation[] = []
): GraphSnapshot => ({ entities, relations });

/** No cast: a cast here would hide exactly the drift this file exists to catch. */
const row = (id: string, over: Partial<CaseRow> = {}): CaseRow => ({
  corroboration: 1,
  degree: 0,
  fresh: false,
  id,
  identifiers: [],
  kind: "domain",
  seenAt: 0,
  sources: [],
  state: "new",
  transforms: [],
  value: id,
  ...over,
});

const placed = layout(
  snapshot(
    [entity("a.example"), entity("b.example"), entity("1.1.1.1", "ip-address")],
    [
      relation("r1", "a.example", "b.example"),
      relation("r2", "b.example", "1.1.1.1"),
    ]
  ),
  { size: 600 }
);

describe("graphView", () => {
  it("carries every placed node and edge into the view", () => {
    const view = graphView(placed);
    assert.equal(view.nodes.length, 3);
    assert.equal(view.edges.length, 2);
  });

  it("gives every node an accessible name and a position", () => {
    for (const node of graphView(placed).nodes) {
      assert.isTrue(node.title.length > 0, `${node.id} has no title`);
      assert.isTrue(Number.isFinite(node.x) && Number.isFinite(node.y));
    }
  });

  it("names an edge by its relation type so selection can be announced", () => {
    const view = graphView(placed);
    assert.deepEqual(
      [...new Set(view.edges.map((edge) => edge.title))],
      ["resolves-to"]
    );
  });

  it("makes an edge selectable only when it stands for a relation", () => {
    assert.isTrue(graphView(placed).edges.every((edge) => edge.selectable));
  });

  it("keeps the entity kind, which is what presentation resolves on", () => {
    const view = graphView(placed);
    assert.deepEqual([...kindsInView(view)].sort(), ["domain", "ip-address"]);
  });

  it("applies caller decoration without losing what the node is", () => {
    const view = graphView(placed, {
      decorateNode: () => ({ classes: ["vk-node--kept"], label: "renamed" }),
    });
    for (const node of view.nodes) {
      assert.include(node.classes, "vk-node--kept");
      assert.include(node.classes, "vk-node--entity");
      assert.equal(node.label, "renamed");
    }
  });
});

describe("seed", () => {
  it("is drawn as unevidenced, because nothing has asserted it yet", () => {
    const seed = seedNodeView("seed-1", "acme.example", { x: 300, y: 34 });
    assert.include(seed.classes, "vk-node--seed");
    assert.equal(seed.nodeKind, "seed");
    assert.equal(seed.title, "seed acme.example");
  });

  it("is not counted among the graph's kinds — it is not in the graph", () => {
    const view = caseGraphView(placed, {
      byId: new Map(),
      seed: { id: "seed-1", label: "acme.example" },
      seedPoint: { x: 300, y: 34 },
      slots: new Map(),
    });
    assert.equal(view.nodes.length, 4);
    assert.notInclude(kindsInView(view), "seed");
  });
});

describe("caseGraphView", () => {
  const byId = new Map([
    ["a.example", row("a.example", { state: "discarded" })],
    ["b.example", row("b.example", { state: "kept" })],
    ["1.1.1.1", row("1.1.1.1", { kind: "ip-address", value: "1.1.1.1" })],
  ]);
  const slots = new Map([
    ["domain", 0],
    ["ip-address", 1],
  ]);
  const view = caseGraphView(placed, { byId, slots });

  const node = (id: string) =>
    view.nodes.find((one) => one.id === id) ?? {
      classes: [] as readonly string[],
      id: `${id} (missing from view)`,
    };

  it("carries curation onto the node", () => {
    assert.include(node("a.example").classes, "vk-node--discarded");
    assert.include(node("b.example").classes, "vk-node--kept");
  });

  it("leaves an unreviewed entity unmarked rather than inventing a state", () => {
    assert.isFalse(
      node("1.1.1.1").classes.some((one) => one.startsWith("vk-node--new"))
    );
  });

  it("colours by kind, so one kind is one colour", () => {
    assert.include(node("a.example").classes, "vk-node--cat-1");
    assert.include(node("b.example").classes, "vk-node--cat-1");
    assert.include(node("1.1.1.1").classes, "vk-node--cat-2");
  });

  it("mutes an edge touching a discarded entity, but keeps the edge", () => {
    const muted = view.edges.filter((edge) =>
      edge.classes.includes("vk-edge--muted")
    );
    assert.equal(muted.length, 1);
    assert.equal(muted[0]?.id, "r1");
    assert.equal(
      view.edges.length,
      2,
      "a discarded entity is still in the log"
    );
  });
});

describe("both surfaces render through the one component", () => {
  it("produce the same shape of view model from the same layout", () => {
    const pane = graphView(placed);
    const workbench = caseGraphView(placed, {
      byId: new Map(),
      slots: new Map(),
    });
    assert.deepEqual(
      pane.nodes.map((one) => one.id).sort(),
      workbench.nodes.map((one) => one.id).sort()
    );
    assert.deepEqual(
      pane.edges.map((one) => one.id).sort(),
      workbench.edges.map((one) => one.id).sort()
    );
  });

  it("select the same thing by the same id", () => {
    const pane = graphView(placed);
    const workbench = caseGraphView(placed, {
      byId: new Map(),
      slots: new Map(),
    });
    for (const node of pane.nodes) {
      const twin = workbench.nodes.find((one) => one.id === node.id);
      assert.isDefined(twin);
      assert.equal(twin.nodeKind, node.nodeKind);
      assert.equal(twin.selectable, node.selectable);
    }
  });
});
