import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkChange, evaluate } from "./guard.js";

const roots: string[] = [];

const run = async (cwd: string, args: readonly string[]): Promise<void> => {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(
      `git ${args.join(" ")}: ${await new Response(proc.stderr).text()}`
    );
  }
};

const put = async (root: string, path: string, text: string) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
};

/** A repository with a base commit holding protected and ordinary files. */
const makeRepo = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "viokit-guard-"));
  roots.push(root);
  await run(root, ["init", "-q", "-b", "base"]);
  await run(root, ["config", "user.email", "t@example.com"]);
  await run(root, ["config", "user.name", "t"]);
  await put(
    root,
    "package.json",
    JSON.stringify({ scripts: { conformance: "bun conformance/check.ts" } })
  );
  await put(root, "conformance/rules/r.grit", "language js\n");
  await put(root, "packages/a/test/a.test.ts", "export {};\n");
  await put(root, "packages/a/src/a.ts", "export const a = 1;\n");
  await run(root, ["add", "-A"]);
  await run(root, ["commit", "-q", "-m", "base"]);
  await run(root, ["switch", "-q", "-c", "work"]);
  return root;
};

const commit = async (root: string) => {
  await run(root, ["add", "-A"]);
  await run(root, ["commit", "-q", "-m", "change"]);
};

afterAll(async () => {
  await Promise.all(roots.map((r) => rm(r, { force: true, recursive: true })));
});

describe("held-out guard", () => {
  it("fails an edited conformance rule", async () => {
    const root = await makeRepo();
    await put(root, "conformance/rules/r.grit", "language js // weakened\n");
    await commit(root);
    const v = await checkChange(root, "base");
    expect(v.map((x) => x.path)).toContain("conformance/rules/r.grit");
  });

  it("fails a deleted existing test", async () => {
    const root = await makeRepo();
    await rm(join(root, "packages/a/test/a.test.ts"));
    await commit(root);
    const v = await checkChange(root, "base");
    expect(v.map((x) => x.path)).toContain("packages/a/test/a.test.ts");
  });

  it("fails a modified existing test", async () => {
    const root = await makeRepo();
    await put(
      root,
      "packages/a/test/a.test.ts",
      "export const loosened = 1;\n"
    );
    await commit(root);
    expect((await checkChange(root, "base")).length).toBe(1);
  });

  it("allows an added test file and ordinary source changes", async () => {
    const root = await makeRepo();
    await put(root, "packages/a/test/new.test.ts", "export {};\n");
    await put(root, "packages/a/src/a.ts", "export const a = 2;\n");
    await commit(root);
    expect(await checkChange(root, "base")).toHaveLength(0);
  });

  it("fails a changed conformance script in package.json", async () => {
    const root = await makeRepo();
    await put(
      root,
      "package.json",
      JSON.stringify({ scripts: { conformance: "true" } })
    );
    await commit(root);
    const v = await checkChange(root, "base");
    expect(v.map((x) => x.path)).toContain("package.json");
  });

  it("allows an unrelated package.json change", async () => {
    const root = await makeRepo();
    await put(
      root,
      "package.json",
      JSON.stringify({
        scripts: { conformance: "bun conformance/check.ts", extra: "echo" },
      })
    );
    await commit(root);
    expect(await checkChange(root, "base")).toHaveLength(0);
  });

  it("fails a vocabulary edit without the steward flag", async () => {
    const root = await makeRepo();
    await put(
      root,
      "packages/vocabulary/src/vocabulary.ts",
      "export const x = 2;\n"
    );
    await commit(root);
    const v = await checkChange(root, "base");
    expect(v.map((x) => x.path)).toContain(
      "packages/vocabulary/src/vocabulary.ts"
    );
  });

  it("allows a vocabulary edit with the steward flag", async () => {
    const root = await makeRepo();
    await put(
      root,
      "packages/vocabulary/src/vocabulary.ts",
      "export const x = 2;\n"
    );
    await commit(root);
    expect(await checkChange(root, "base", { steward: true })).toHaveLength(0);
  });

  it("still fails a conformance rule edit under the steward flag", async () => {
    const root = await makeRepo();
    await put(
      root,
      "packages/vocabulary/src/vocabulary.ts",
      "export const x = 2;\n"
    );
    await put(root, "conformance/rules/r.grit", "language js // weakened\n");
    await commit(root);
    const v = await checkChange(root, "base", { steward: true });
    expect(v.map((x) => x.path)).toEqual(["conformance/rules/r.grit"]);
  });

  it("fails a changed main specification", () => {
    const v = evaluate(
      [{ path: "openspec/specs/cache/spec.md", status: "M" }],
      false
    );
    expect(v).toHaveLength(1);
  });
});
