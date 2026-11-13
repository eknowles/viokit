import { describe, expect, it } from "bun:test";
import { findPluginSuppressions, runPluginRules } from "./check.js";

describe("I4/I10 conformance controls", () => {
  it("flags the deliberately violating fixture", async () => {
    const result = await runPluginRules(["conformance/fixtures/violation.ts"]);
    expect(result.ok).toBe(false);
    expect(result.output).toContain("I4/I10");
  });

  it("passes a file that does no outbound I/O", async () => {
    const result = await runPluginRules(["conformance/fixtures/clean.ts"]);
    expect(result.ok).toBe(true);
  });

  it("flags a line-level suppression of the plugin", () => {
    const found = findPluginSuppressions(
      "x.ts",
      "// biome-ignore lint/plugin: bypass\nfetch(url);"
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.line).toBe(1);
  });

  it("flags a file-level suppression of the plugin", () => {
    const found = findPluginSuppressions(
      "x.ts",
      "// biome-ignore-all lint/plugin: bypass\nfetch(url);"
    );
    expect(found).toHaveLength(1);
  });

  it("ignores a suppression of a different rule", () => {
    const found = findPluginSuppressions(
      "x.ts",
      "// biome-ignore lint/style/useErrorCause: forwarded\nthrow e;"
    );
    expect(found).toHaveLength(0);
  });
});
