import { assert, describe, it } from "vitest";
import {
  asViewName,
  DEFAULT_VIEW,
  isTyping,
  shortcutOf,
  VIEW_NAMES,
  VIEWS,
  viewForShortcut,
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

describe("keyboard shortcuts", () => {
  it("gives every view in the rail a shortcut", () => {
    for (const entry of VIEWS) {
      const key = shortcutOf(entry.name);
      assert.equal(
        viewForShortcut(key),
        entry.name,
        `${key} should select ${entry.name}`
      );
    }
  });

  it("numbers them in the order they appear, so the rail teaches itself", () => {
    assert.deepStrictEqual(
      VIEWS.map((entry) => shortcutOf(entry.name)),
      VIEWS.map((_, index) => String(index + 1))
    );
  });

  it("puts the case on 1", () => {
    assert.equal(viewForShortcut("1"), "case");
  });

  it("ignores keys that select nothing", () => {
    for (const key of ["0", "7", "8", "9", "a", "Enter", "", "11", " "]) {
      assert.isNull(viewForShortcut(key), `${key} should select nothing`);
    }
  });

  it("does not collide with the browser's own digit shortcuts", () => {
    // Cmd/Ctrl+1..9 switches browser tabs, so the console uses bare digits
    // and the caller drops the event when a modifier is held.
    assert.isNotNull(viewForShortcut("1"));
  });
});

describe("not stealing keys from someone typing", () => {
  const el = (tag: string): EventTarget =>
    ({ isContentEditable: false, tagName: tag }) as unknown as EventTarget;

  it("stands aside for a text field", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      assert.isTrue(isTyping(el(tag)), `${tag} should keep its keystrokes`);
    }
  });

  it("stands aside for a rich-text region", () => {
    assert.isTrue(
      isTyping({
        isContentEditable: true,
        tagName: "DIV",
      } as unknown as EventTarget)
    );
  });

  it("takes the key everywhere else", () => {
    assert.isFalse(isTyping(el("DIV")));
    assert.isFalse(isTyping(el("BUTTON")));
    assert.isFalse(isTyping(null));
  });
});
