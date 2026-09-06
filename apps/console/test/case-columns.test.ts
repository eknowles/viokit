import { describe, expect, it } from "vitest";
import {
  columnsFor,
  identifierCells,
  imageColumns,
  isImageValue,
  kindTabs,
  modeKey,
  relationRows,
  rowsForMode,
} from "../src/case-columns.js";
import type { CaseRow } from "../src/case-table.js";
import type { GraphSnapshot } from "../src/graph-layout.js";

const row = (
  id: string,
  kind: string,
  identifiers: readonly { kind: string; value: string }[] = []
): CaseRow => ({
  corroboration: 1,
  degree: 0,
  fresh: false,
  id,
  identifiers,
  kind,
  seenAt: 0,
  sources: ["crt.sh"],
  state: "new",
  transforms: [],
  value: identifiers[0]?.value ?? id,
});

describe("columns come from the data, not from a registry", () => {
  it("derives a column per identifier kind present", () => {
    expect(
      columnsFor([
        row("a", "person", [
          { kind: "name", value: "R. Calloway" },
          { kind: "dob", value: "1974-02-01" },
        ]),
        row("b", "person", [{ kind: "name", value: "J. Vance" }]),
      ])
    ).toEqual(["name", "dob"]);
  });

  it("puts the column every row fills first, then breaks ties by name", () => {
    expect(
      columnsFor([
        row("a", "x", [
          { kind: "zeta", value: "1" },
          { kind: "beta", value: "2" },
        ]),
        row("b", "x", [{ kind: "beta", value: "3" }]),
      ])
    ).toEqual(["beta", "zeta"]);
  });

  it("counts a repeated kind on one entity once", () => {
    expect(
      columnsFor([
        row("a", "x", [
          { kind: "alias", value: "one" },
          { kind: "alias", value: "two" },
        ]),
      ])
    ).toEqual(["alias"]);
  });

  it("has no columns for entities carrying no identifiers", () => {
    expect(columnsFor([row("a", "x")])).toEqual([]);
  });

  it("keeps the first of a repeated kind and counts the rest", () => {
    const cells = identifierCells(
      row("a", "x", [
        { kind: "alias", value: "one" },
        { kind: "alias", value: "two" },
        { kind: "alias", value: "three" },
      ])
    );
    // Dropping the others silently would make the cell claim to be the whole
    // truth about that field.
    expect(cells.alias).toEqual({ extra: 2, value: "one" });
  });
});

describe("images are recognised by value, never by field name", () => {
  it("accepts http(s) urls with an image extension, and data urls", () => {
    expect(isImageValue("https://example.com/a/face.jpg")).toBe(true);
    expect(isImageValue("http://example.com/x.PNG")).toBe(true);
    expect(isImageValue("data:image/png;base64,iVBOR")).toBe(true);
  });

  it("rejects anything that is not a fetchable image", () => {
    expect(isImageValue("acme.example")).toBe(false);
    expect(isImageValue("https://example.com/profile")).toBe(false);
    expect(isImageValue("file:///etc/passwd.png")).toBe(false);
    expect(isImageValue("javascript:alert(1)//x.png")).toBe(false);
    expect(isImageValue("")).toBe(false);
  });

  it("does not treat a field called photo as an image on faith", () => {
    // The name says picture; the value says otherwise, and the value wins.
    expect(
      imageColumns(
        [row("a", "person", [{ kind: "photo", value: "unknown" }])],
        ["photo"]
      )
    ).toEqual([]);
  });

  it("offers a column as imagery only when every value it holds is one", () => {
    const rows = [
      row("a", "person", [{ kind: "photo", value: "https://x.test/a.jpg" }]),
      row("b", "person", [{ kind: "photo", value: "https://x.test/b.png" }]),
    ];
    expect(imageColumns(rows, ["photo"])).toEqual(["photo"]);

    const mixed = [
      ...rows,
      row("c", "person", [{ kind: "photo", value: "not-a-url" }]),
    ];
    expect(imageColumns(mixed, ["photo"])).toEqual([]);
  });

  it("ignores rows that simply do not carry the column", () => {
    const rows = [
      row("a", "person", [{ kind: "photo", value: "https://x.test/a.jpg" }]),
      row("b", "person", [{ kind: "name", value: "J. Vance" }]),
    ];
    expect(imageColumns(rows, ["photo", "name"])).toEqual(["photo"]);
  });
});

describe("relations", () => {
  const graph: GraphSnapshot = {
    entities: [],
    relations: [
      {
        id: "r1",
        sourceId: "a",
        targetId: "b",
        temporalExtent: { validFrom: "1970-01-01", validTo: "9999-12-31" },
        type: "resolves-to",
      },
      {
        id: "r2",
        sourceId: "a",
        targetId: "gone",
        temporalExtent: { validFrom: "1970-01-01", validTo: "9999-12-31" },
        type: "has-subdomain",
      },
    ],
  };
  const rows = [
    row("a", "domain", [{ kind: "domain", value: "acme.example" }]),
    row("b", "ip-address", [{ kind: "ipv4", value: "1.2.3.4" }]),
  ];

  it("resolves endpoints to what the table already calls them", () => {
    const found = relationRows(graph, rows).find((one) => one.id === "r1");
    expect(found?.sourceValue).toBe("acme.example");
    expect(found?.targetValue).toBe("1.2.3.4");
    expect(found?.targetKind).toBe("ip-address");
  });

  it("orders by relation type, so like sits with like", () => {
    expect(relationRows(graph, rows).map((one) => one.type)).toEqual([
      "has-subdomain",
      "resolves-to",
    ]);
  });

  it("falls back to the id when an endpoint is not in the case", () => {
    const found = relationRows(graph, rows).find((one) => one.id === "r2");
    expect(found?.targetValue).toBe("gone");
    expect(found?.targetKind).toBe("—");
  });

  it("mutes a relation when either end has been discarded", () => {
    const discarded = [{ ...rows[0], state: "discarded" } as CaseRow, rows[1]];
    expect(
      relationRows(
        graph,
        discarded.filter((one) => one !== undefined)
      ).every((one) => one.state === "discarded")
    ).toBe(true);
  });
});

describe("modes", () => {
  const rows = [row("a", "domain"), row("b", "domain"), row("c", "ip-address")];

  it("offers a tab per kind, biggest first", () => {
    expect(kindTabs(rows)).toEqual([
      { count: 2, kind: "domain" },
      { count: 1, kind: "ip-address" },
    ]);
  });

  it("narrows to one kind, or shows everything", () => {
    expect(rowsForMode(rows, { _tag: "all" })).toHaveLength(3);
    expect(
      rowsForMode(rows, { _tag: "kind", kind: "domain" }).map((one) => one.id)
    ).toEqual(["a", "b"]);
  });

  it("keys each mode distinctly so switching remounts the table", () => {
    expect(modeKey({ _tag: "all" })).toBe("all");
    expect(modeKey({ _tag: "relations" })).toBe("relations");
    expect(modeKey({ _tag: "kind", kind: "domain" })).toBe("kind:domain");
  });
});
