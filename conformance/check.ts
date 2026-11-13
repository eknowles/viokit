import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { scanPacks } from "./vocabulary.js";

/**
 * Conformance checks for I4/I10 (see conformance/README.md). Two checks run
 * here: the Biome plugin rules, and a scan for suppression comments that would
 * switch those rules off.
 */

const CONFIG = "conformance/biome-conformance.json";
const SCAN_ROOTS = ["packages", "apps"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);
const SOURCE_FILE = /\.(ts|tsx)$/;
const PLUGIN_SUPPRESSION = /biome-ignore[\w-]*\s+lint\/plugin/;

export interface Finding {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** Runs the plugin rules over `paths`. Biome exits non-zero on any plugin error. */
export const runPluginRules = async (
  paths: readonly string[]
): Promise<{ readonly ok: boolean; readonly output: string }> => {
  const proc = Bun.spawn(
    [
      "node_modules/.bin/biome",
      "lint",
      `--config-path=${CONFIG}`,
      "--colors=off",
      ...paths,
    ],
    { stderr: "pipe", stdout: "pipe" }
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { ok: code === 0, output: `${stdout}${stderr}` };
};

/** Finds suppression comments that name the conformance plugin. */
export const findPluginSuppressions = (
  file: string,
  source: string
): readonly Finding[] => {
  const findings: Finding[] = [];
  const lines = source.split("\n");
  for (const [index, text] of lines.entries()) {
    if (PLUGIN_SUPPRESSION.test(text)) {
      findings.push({ file, line: index + 1, text: text.trim() });
    }
  }
  return findings;
};

const sourceFiles = async (root: string): Promise<readonly string[]> => {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (SKIP_DIRS.has(entry.name)) {
        return [];
      }
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        return await sourceFiles(path);
      }
      return SOURCE_FILE.test(entry.name) ? [path] : [];
    })
  );
  return nested.flat();
};

export const scanSuppressions = async (
  roots: readonly string[] = SCAN_ROOTS
): Promise<readonly Finding[]> => {
  const files = (await Promise.all(roots.map(sourceFiles))).flat();
  const found = await Promise.all(
    files.map(async (file) =>
      findPluginSuppressions(file, await readFile(file, "utf8"))
    )
  );
  return found.flat();
};

const main = async (): Promise<number> => {
  const rules = await runPluginRules(SCAN_ROOTS);
  const suppressions = await scanSuppressions();
  const unknownNames = await scanPacks();

  if (!rules.ok) {
    process.stderr.write(
      `I4/I10 conformance: plugin rules failed\n${rules.output}\n`
    );
  }
  for (const finding of suppressions) {
    process.stderr.write(
      `I4/I10 conformance: ${finding.file}:${finding.line} suppresses the conformance plugin: ${finding.text}\n`
    );
  }
  for (const unknown of unknownNames) {
    process.stderr.write(
      `vocabulary conformance: ${unknown.file}:${unknown.line} uses ${unknown.what} "${unknown.name}", which is not in @viokit/vocabulary\n`
    );
  }
  if (rules.ok && suppressions.length === 0 && unknownNames.length === 0) {
    process.stdout.write("conformance: ok\n");
    return 0;
  }
  return 1;
};

if (import.meta.main) {
  process.exit(await main());
}
