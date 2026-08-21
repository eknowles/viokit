import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Markers that identify the workspace root, most specific first. A config file
 * wins over the `openspec/` directory so a nested project can opt out of an
 * enclosing workspace.
 */
const ROOT_MARKERS = ["viokit.config.json", "openspec"] as const;

/** Every directory from `dir` up to the filesystem root, nearest first. */
const ancestors = (dir: string): readonly string[] => {
  const chain: string[] = [];
  let current = resolve(dir);
  let parent = dirname(current);
  chain.push(current);
  while (parent !== current) {
    current = parent;
    parent = dirname(current);
    chain.push(current);
  }
  return chain;
};

/**
 * Resolves the workspace root by walking up from `startDir`, so paths do not
 * depend on the directory a CLI happened to be invoked from. Falls back to
 * `startDir` when no marker is found.
 */
export const findProjectRoot = (startDir: string): string => {
  for (const dir of ancestors(startDir)) {
    for (const marker of ROOT_MARKERS) {
      if (existsSync(join(dir, marker))) {
        return dir;
      }
    }
  }
  return resolve(startDir);
};
