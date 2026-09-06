import { assert, describe, it } from "vitest";
import { graphElements, mirrorItems } from "../src/graph-elements.js";
import { graphStylesheet } from "../src/graph-style.js";
import type { GraphView } from "../src/graph-view.js";

const view: GraphView = {
  edges: [
    {
      classes: ["vk-edge--muted"],
      id: "r1",
      selectable: true,
      source: "a",
      target: "b",
      title: "resolves-to",
    },
    {
      classes: [],
      id: "ev1->a",
      selectable: false,
      source: "ev1",
      target: "a",
      title: "connection",
    },
  ],
  nodes: [
    {
      classes: ["vk-node--entity", "vk-node--cat-1"],
      id: "a",
      kind: "domain",
      label: "a.example",
      nodeKind: "entity",
      selectable: true,
      title: "domain a.example",
      x: 10,
      y: 20,
    },
    {
      classes: ["vk-node--entity", "vk-node--cat-2", "vk-node--discarded"],
      id: "b",
      kind: "ip-address",
      label: "1.1.1.1",
      nodeKind: "entity",
      selectable: true,
      title: "ip-address 1.1.1.1",
      x: 30,
      y: 40,
    },
    {
      classes: ["vk-node--event"],
      id: "ev1",
      kind: "observation",
      label: "ev1",
      nodeKind: "event",
      selectable: true,
      title: "observation ev1",
      x: 50,
      y: 60,
    },
  ],
};

describe("graphElements", () => {
  const elements = graphElements(view);

  it("hands positions over rather than recomputing them", () => {
    const a = elements.find((one) => one.data.id === "a");
    assert.deepEqual(a?.position, { x: 10, y: 20 });
  });

  it("carries classes across, so the stylesheet can do its job", () => {
    const b = elements.find((one) => one.data.id === "b");
    assert.include(b?.classes ?? "", "vk-node--discarded");
    assert.include(b?.classes ?? "", "vk-node--cat-2");
  });

  it("keeps the entity kind on the element, which presentation resolves on", () => {
    assert.equal(
      elements.find((one) => one.data.id === "a")?.data.kind,
      "domain"
    );
  });

  it("carries the accessible name, so a tap can be announced", () => {
    assert.equal(
      elements.find((one) => one.data.id === "b")?.data.title,
      "ip-address 1.1.1.1"
    );
  });

  it("keeps every node and every edge — including unselectable ones", () => {
    assert.equal(elements.filter((one) => one.group === "nodes").length, 3);
    assert.equal(elements.filter((one) => one.group === "edges").length, 2);
  });

  it("marks which edges are not controls", () => {
    const edge = elements.find((one) => one.data.id === "ev1->a");
    assert.isFalse(edge?.data.selectable);
  });
});

describe("the accessibility mirror", () => {
  const items = mirrorItems(view);

  it("represents everything selectable on the canvas", () => {
    assert.deepEqual(
      items.map((one) => one.id),
      ["a", "b", "ev1", "r1"]
    );
  });

  it("omits what is not a control, so a keyboard walk is not noise", () => {
    assert.notInclude(
      items.map((one) => one.id),
      "ev1->a"
    );
  });

  it("names every item — an unnamed control is unusable by a screen reader", () => {
    for (const item of items) {
      assert.isTrue(item.title.trim().length > 0, `${item.id} is unnamed`);
    }
  });

  it("is derived from the same view model as the drawing, so it cannot go stale", () => {
    const drawn = new Set(graphElements(view).map((one) => one.data.id));
    for (const item of items) {
      assert.isTrue(
        drawn.has(item.id),
        `${item.id} is announced but not drawn`
      );
    }
  });

  it("distinguishes a node from an edge, because selecting them differs", () => {
    assert.equal(items.find((one) => one.id === "r1")?.kind, "edge");
    assert.equal(items.find((one) => one.id === "a")?.kind, "node");
  });
});

describe("graphStylesheet", () => {
  const seen: string[] = [];
  const sheet = graphStylesheet((name) => {
    seen.push(name);
    return `token(${name})`;
  });
  const find = (selector: string) =>
    sheet.filter((rule) => rule.selector === selector);

  it("reads its colours from tokens rather than hard-coding them", () => {
    assert.include(seen, "--vk-graph-edge");
    assert.include(seen, "--vk-cat-1");
    assert.include(seen, "--vk-accent-strong");
    const literal = JSON.stringify(sheet).match(/#[0-9a-f]{6}/gi) ?? [];
    assert.deepEqual(
      literal,
      [],
      "a literal colour is how the two stylesheets drift apart"
    );
  });

  it("defines every category slot the design system has", () => {
    for (const slot of [1, 2, 3, 4, 5, 6]) {
      assert.equal(find(`node.vk-node--cat-${slot}`).length, 1, `slot ${slot}`);
    }
  });

  it("lets state beat kind — a discarded node is hollow whatever it is", () => {
    const kindAt = sheet.findIndex((r) => r.selector === "node.vk-node--cat-1");
    const stateAt = sheet.findLastIndex(
      (r) => r.selector === "node.vk-node--discarded"
    );
    assert.isTrue(stateAt > kindAt, "state must resolve after kind");
  });

  it("draws focus, because a canvas has no focus ring to inherit", () => {
    assert.isNotEmpty(find("node.is-focused"));
    assert.isNotEmpty(find("edge.is-focused"));
  });

  it("keeps a discarded entity visible — it is still in the log", () => {
    const style = find("node.vk-node--discarded").at(-1)?.style as
      | Record<string, unknown>
      | undefined;
    assert.equal(style?.opacity, 0.28);
    assert.notEqual(style?.display, "none");
  });

  it("rebuilds from whatever tokens it is given, so a theme change follows", () => {
    const dark = graphStylesheet(() => "#000000");
    const light = graphStylesheet(() => "#ffffff");
    assert.notDeepEqual(dark, light);
  });
});
