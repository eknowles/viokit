import { assert, describe, it } from "vitest";
import {
  asViewName,
  DEFAULT_VIEW,
  VIEW_NAMES,
  VIEWS,
} from "../src/navigation.js";
import { defaultViewState } from "../src/persistence.js";

describe("the rail reaches every view", () => {
  it("has an icon for every view the console has", () => {
    // The bug this exists for: `case` was a view the console *opened on* with
    // no rail entry, so clicking any icon left it with no icon to come back
    // to. A type cannot check a list against a type; this can.
    const railed = VIEWS.map((entry) => entry.name).sort();
    assert.deepStrictEqual(
      railed,
      [...VIEW_NAMES].sort(),
      "a view with no rail entry is a view nobody can navigate to"
    );
  });

  it("has no rail entry pointing at a view that does not exist", () => {
    for (const entry of VIEWS) {
      assert.isNotNull(asViewName(entry.name), `${entry.name} is not a view`);
    }
  });

  it("names and titles every entry — the rail shows glyphs only", () => {
    for (const entry of VIEWS) {
      assert.isTrue(entry.label.length > 0, `${entry.name} has no label`);
      assert.isTrue(entry.title.length > 0, `${entry.name} has no title`);
    }
  });

  it("opens on a view that is actually in the rail", () => {
    assert.include(
      VIEWS.map((entry) => entry.name),
      DEFAULT_VIEW
    );
    assert.equal(defaultViewState.view, DEFAULT_VIEW);
  });

  it("lists the case first — it is the unit of work", () => {
    assert.equal(VIEWS[0]?.name, "case");
  });
});

describe("restoring a stored view", () => {
  it("accepts every real view name", () => {
    for (const name of VIEW_NAMES) {
      assert.equal(asViewName(name), name);
    }
  });

  it("rejects a name that is not a view rather than rendering a fallback", () => {
    // A payload written by a different console, or a view since removed.
    for (const junk of ["", "dashboard", "case ", null, 3, {}]) {
      assert.isNull(asViewName(junk), `${JSON.stringify(junk)} is not a view`);
    }
  });
});
