import { describe, expect, it } from "vitest";
import {
  entityKindNames,
  entityKinds,
  relationTypeNames,
  relationTypes,
} from "../src/vocabulary.js";

const HYPHENATED = /^[a-z]+(-[a-z]+)*$/;

describe("vocabulary", () => {
  it("names every entry in lower-case hyphenated form with a description", () => {
    for (const entry of [...entityKinds, ...relationTypes]) {
      expect(entry.name).toMatch(HYPHENATED);
      expect(entry.description.length).toBeGreaterThan(10);
    }
  });

  it("has no duplicate names", () => {
    expect(entityKindNames.size).toBe(entityKinds.length);
    expect(relationTypeNames.size).toBe(relationTypes.length);
  });

  it("keeps the names the web-dns pack already uses", () => {
    for (const kind of ["domain", "ip-address"]) {
      expect(entityKindNames.has(kind)).toBe(true);
    }
    for (const type of [
      "alias-of",
      "delegated-to",
      "has-subdomain",
      "resolves-to",
    ]) {
      expect(relationTypeNames.has(type)).toBe(true);
    }
  });

  it("has ten kinds and thirteen relations", () => {
    expect(entityKinds).toHaveLength(10);
    expect(relationTypes).toHaveLength(13);
  });
});
