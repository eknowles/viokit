import { assert, describe, it } from "vitest";
import type { ViewSpecs } from "../src/view-spec.js";
import {
  legendFor,
  presentationFor,
  slotsForKinds,
  titleFor,
} from "../src/view-spec.js";

const KINDS = ["domain", "ip-address", "certificate"];

const specs: ViewSpecs = {
  certificate: { colour: 4, icon: "/icons/cert.svg", label: "certificate" },
  domain: { icon: "/icons/domain.svg", label: "Domain" },
};

describe("slotsForKinds", () => {
  it("gives every kind a slot", () => {
    const slots = slotsForKinds(KINDS);
    for (const kind of KINDS) {
      assert.isNumber(slots.get(kind), kind);
    }
  });

  it("is stable regardless of the order kinds arrive in", () => {
    // A kind must not change colour because a different entity came back
    // first — the legend would then be describing the previous render.
    assert.deepStrictEqual(
      [...slotsForKinds(KINDS)],
      [...slotsForKinds([...KINDS].reverse())]
    );
  });

  it("gives different kinds different slots, up to the six there are", () => {
    const slots = slotsForKinds(KINDS);
    assert.equal(new Set([...slots.values()]).size, KINDS.length);
  });

  it("wraps rather than running off the end of the palette", () => {
    const many = Array.from({ length: 9 }, (_, i) => `kind-${i}`);
    for (const slot of slotsForKinds(many).values()) {
      assert.isTrue(slot >= 0 && slot < 6, `slot ${slot} is out of range`);
    }
  });
});

describe("presentationFor", () => {
  const slots = slotsForKinds(KINDS);

  it("uses a pack's chosen colour over the assigned slot", () => {
    assert.include(
      presentationFor("certificate", specs, slots).classes,
      "vk-node--cat-4"
    );
  });

  it("carries a described kind's icon", () => {
    assert.equal(
      presentationFor("domain", specs, slots).icon,
      "/icons/domain.svg"
    );
  });

  it("uses a pack's display name when it has one", () => {
    assert.equal(presentationFor("domain", specs, slots).label, "Domain");
  });

  it("still renders a kind nothing describes", () => {
    const shown = presentationFor("ip-address", specs, slots);
    assert.isFalse(shown.described);
    assert.isNotEmpty(shown.classes);
  });

  it("falls back to naming the kind, not to a generic word", () => {
    // "unknown" or "entity" would imply we know it is generic. We know only
    // that no pack described it, and the kind still says what it is.
    assert.equal(
      presentationFor("ip-address", specs, slots).label,
      "ip-address"
    );
  });

  it("gives an undescribed kind no icon rather than a stand-in", () => {
    assert.isUndefined(presentationFor("ip-address", specs, slots).icon);
  });

  it("always lands on a real palette slot", () => {
    for (const kind of [...KINDS, "kind-nobody-has-seen"]) {
      const [cls = ""] = presentationFor(kind, specs, slots).classes;
      const slot = Number(cls.replace("vk-node--cat-", ""));
      assert.isTrue(slot >= 1 && slot <= 6, `${kind} → ${cls}`);
    }
  });
});

describe("titleFor", () => {
  it("names a described kind by its display name", () => {
    assert.equal(
      titleFor({ kind: "domain", label: "acme.example" }, specs),
      "Domain acme.example"
    );
  });

  it("names an undescribed kind by its kind, so it is never anonymous", () => {
    assert.equal(
      titleFor({ kind: "ip-address", label: "1.1.1.1" }, specs),
      "ip-address 1.1.1.1"
    );
  });
});

describe("legendFor", () => {
  const slots = slotsForKinds(KINDS);
  const counts = new Map([
    ["domain", 12],
    ["ip-address", 3],
    ["certificate", 1],
  ]);

  it("covers every kind in use, described or not", () => {
    const entries = legendFor(KINDS, specs, slots, counts);
    assert.deepStrictEqual(entries.map((one) => one.label).sort(), [
      "Domain",
      "certificate",
      "ip-address",
    ]);
  });

  it("matches the colour a node is actually drawn in", () => {
    for (const entry of legendFor(KINDS, specs, slots, counts)) {
      const kind =
        KINDS.find((one) => (specs[one]?.label ?? one) === entry.label) ?? "";
      assert.include(
        presentationFor(kind, specs, slots).classes,
        `vk-node--cat-${entry.cat}`,
        `${entry.label} legend colour disagrees with its nodes`
      );
    }
  });

  it("reports how many of each there are", () => {
    const entries = legendFor(KINDS, specs, slots, counts);
    assert.equal(entries.find((one) => one.label === "Domain")?.count, 12);
  });

  it("says nothing when nothing is on screen", () => {
    assert.isEmpty(legendFor([], specs, slots));
  });
});
