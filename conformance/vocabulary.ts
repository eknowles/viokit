import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  entityKindNames,
  relationTypeNames,
} from "../packages/vocabulary/src/vocabulary.js";

/**
 * Entity kinds and relation types must come from @viokit/vocabulary. The scan
 * is syntactic: it reads string literals in `kind: "…"`, in
 * `entityOfKind("…", …)` / `keyOf("…", …)`, and in `linked(from, to, "…")`. A name built dynamically is not seen.
 */

const PACKS_ROOT = "packages/packs";
const SKIP_DIRS = new Set(["node_modules", "dist", "test"]);
const SOURCE_FILE = /\.ts$/;
const TEST_FILE = /\.test\.ts$/;
/** `kind` is also the passive/active classification on exec sources. */
const TOOL_CLASSIFICATIONS = new Set(["passive", "active"]);
const KIND_LITERAL = /\bkind:\s*"([a-z][a-z-]*)"/g;
/** Entities built through the pack helpers: `entityOfKind("kind", …)`, `keyOf("kind", …)`. */
const KIND_ARGUMENT = /\b(?:entityOfKind|keyOf)\(\s*"([a-z][a-z-]*)"/g;
const RELATION_LITERAL = /\blinked\(\s*[^,()]+,\s*[^,()]+,\s*"([a-z][a-z-]*)"/g;

export interface UnknownName {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly what: "entity kind" | "relation type";
}

const lineOf = (source: string, index: number): number =>
  source.slice(0, index).split("\n").length;

export const findUnknownNames = (
  file: string,
  source: string,
  kinds: ReadonlySet<string> = entityKindNames,
  relations: ReadonlySet<string> = relationTypeNames
): readonly UnknownName[] => {
  const found: UnknownName[] = [];
  for (const match of [
    ...source.matchAll(KIND_LITERAL),
    ...source.matchAll(KIND_ARGUMENT),
  ]) {
    const name = match[1] ?? "";
    if (!(kinds.has(name) || TOOL_CLASSIFICATIONS.has(name))) {
      found.push({
        file,
        line: lineOf(source, match.index),
        name,
        what: "entity kind",
      });
    }
  }
  for (const match of source.matchAll(RELATION_LITERAL)) {
    const name = match[1] ?? "";
    if (!relations.has(name)) {
      found.push({
        file,
        line: lineOf(source, match.index),
        name,
        what: "relation type",
      });
    }
  }
  return found;
};

const packFiles = async (root: string): Promise<readonly string[]> => {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (SKIP_DIRS.has(entry.name)) {
        return [];
      }
      const path = join(root, entry.name);
      if (entry.isDirectory()) {
        return await packFiles(path);
      }
      return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)
        ? [path]
        : [];
    })
  );
  return nested.flat();
};

export const scanPacks = async (
  root: string = PACKS_ROOT
): Promise<readonly UnknownName[]> => {
  const files = await packFiles(root);
  const found = await Promise.all(
    files.map(async (file) =>
      findUnknownNames(file, await readFile(file, "utf8"))
    )
  );
  return found.flat();
};
