import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import { CONFIG_FILE_NAME, loadViokitConfig } from "../src/config.js";
import { findProjectRoot } from "../src/root.js";

/** A workspace root marked the way a real checkout is (an `openspec/` dir). */
const makeWorkspace = (): string => {
  const root = mkdtempSync(join(tmpdir(), "viokit-config-"));
  mkdirSync(join(root, "openspec"));
  mkdirSync(join(root, "packages", "engine", "src"), { recursive: true });
  return root;
};

const load = (
  root: string,
  env: Record<string, string | undefined>,
  cwd = root
) => Effect.runPromise(loadViokitConfig({ cwd, env }));

describe("findProjectRoot", () => {
  it("walks up to the workspace root from a nested directory", () => {
    const root = makeWorkspace();
    expect(findProjectRoot(join(root, "packages", "engine", "src"))).toBe(root);
  });

  it("falls back to the start directory when no marker is found", () => {
    const orphan = mkdtempSync(join(tmpdir(), "viokit-orphan-"));
    expect(findProjectRoot(orphan)).toBe(orphan);
  });
});

describe("loadViokitConfig", () => {
  it("resolves defaults against the root, not the cwd", async () => {
    const root = makeWorkspace();
    const config = await load(
      root,
      {},
      join(root, "packages", "engine", "src")
    );
    expect(config.root).toBe(root);
    expect(config.catalogDb).toBe(join(root, ".viokit/catalog.db"));
    expect(config.packsDir).toBe(join(root, "packages/sources/packs"));
  });

  it("lets the config file override defaults", async () => {
    const root = makeWorkspace();
    writeFileSync(
      join(root, CONFIG_FILE_NAME),
      JSON.stringify({ packsDir: "custom/packs" })
    );
    const config = await load(root, {});
    expect(config.packsDir).toBe(join(root, "custom/packs"));
    expect(config.catalogDb).toBe(join(root, ".viokit/catalog.db"));
  });

  it("lets the environment override the config file", async () => {
    const root = makeWorkspace();
    writeFileSync(
      join(root, CONFIG_FILE_NAME),
      JSON.stringify({ catalogDb: "from-file.db" })
    );
    const config = await load(root, { VIOKIT_CATALOG_DB: "from-env.db" });
    expect(config.catalogDb).toBe(join(root, "from-env.db"));
  });

  it("keeps absolute paths absolute", async () => {
    const root = makeWorkspace();
    const config = await load(root, {
      VIOKIT_CATALOG_DB: "/srv/viokit/catalog.db",
    });
    expect(config.catalogDb).toBe("/srv/viokit/catalog.db");
  });

  it("rejects a malformed config file (I6)", async () => {
    const root = makeWorkspace();
    writeFileSync(
      join(root, CONFIG_FILE_NAME),
      JSON.stringify({ packsDir: 42 })
    );
    const exit = await Effect.runPromiseExit(
      loadViokitConfig({ cwd: root, env: {} })
    );
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("rejects invalid JSON with a typed error", async () => {
    const root = makeWorkspace();
    writeFileSync(join(root, CONFIG_FILE_NAME), "{ not json");
    const exit = await Effect.runPromiseExit(
      loadViokitConfig({ cwd: root, env: {} })
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain("not valid JSON");
    }
  });

  it("honors an explicit root override", async () => {
    const root = makeWorkspace();
    const other = makeWorkspace();
    const config = await load(root, { VIOKIT_ROOT: other });
    expect(config.root).toBe(other);
  });
});
