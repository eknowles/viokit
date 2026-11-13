/**
 * The held-out guard. Fails a change that weakens the checks that judge it.
 *
 * Run by the orchestrator from the BASE branch's copy of this file, so an
 * author who edits the guard still faces the old one:
 *
 *   git show <base>:conformance/guard.ts > "$TMP/guard.ts"
 *   bun "$TMP/guard.ts" <base>
 *
 * Adding a new test file is allowed (a delivered tool brings its own fixture
 * test). Modifying or deleting a file that existed on the base is not.
 */

export interface Change {
  readonly path: string;
  readonly status: string;
}

export interface Violation {
  readonly path: string;
  readonly reason: string;
}

const PROTECTED_EXACT = new Set(["biome.jsonc", "lefthook.yml"]);
const PROTECTED_PREFIXES = ["conformance/", "openspec/specs/"];
/** Only a steward change (guard run with --steward) may edit the vocabulary. */
const VOCABULARY_PREFIX = "packages/vocabulary/";
const TEST_FILE = /(^|\/)test\/|\.test\.tsx?$/;
const ADDED = "A";

const protectedReason = (path: string): string | undefined => {
  if (PROTECTED_EXACT.has(path)) {
    return "configuration that enforces the checks";
  }
  if (PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return "conformance rules or a main specification";
  }
};

/** Pure decision over a change list; `scriptChanged` is the package.json check. */
export const evaluate = (
  changes: readonly Change[],
  scriptChanged: boolean,
  options: { readonly steward?: boolean } = {}
): readonly Violation[] => {
  const violations: Violation[] = [];
  for (const { path, status } of changes) {
    const reason =
      protectedReason(path) ??
      (path.startsWith(VOCABULARY_PREFIX) && options.steward !== true
        ? "the shared vocabulary, which only a steward change may edit"
        : undefined);
    if (reason !== undefined) {
      violations.push({ path, reason });
    } else if (TEST_FILE.test(path) && status !== ADDED) {
      violations.push({
        path,
        reason: "an existing test was modified or deleted",
      });
    }
  }
  if (scriptChanged) {
    violations.push({
      path: "package.json",
      reason: "the conformance script was changed",
    });
  }
  return violations;
};

const git = async (cwd: string, args: readonly string[]): Promise<string> => {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${err.trim()}`);
  }
  return out;
};

/** Invalid JSON throws, so the guard fails closed rather than passing. */
const conformanceScript = (packageJson: string): string | undefined => {
  if (packageJson.length === 0) {
    return;
  }
  const parsed: { scripts?: Record<string, string> } = JSON.parse(packageJson);
  return parsed.scripts?.conformance;
};

export const changesSince = async (
  cwd: string,
  base: string
): Promise<readonly Change[]> => {
  const out = await git(cwd, [
    "diff",
    "--name-status",
    "--no-renames",
    `${base}...HEAD`,
  ]);
  return out
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [status = "", path = ""] = line.split("\t");
      return { path, status: status.slice(0, 1) };
    });
};

export const checkChange = async (
  cwd: string,
  base: string,
  options: { readonly steward?: boolean } = {}
): Promise<readonly Violation[]> => {
  const changes = await changesSince(cwd, base);
  const before = await git(cwd, ["show", `${base}:package.json`]).catch(
    () => ""
  );
  const after = await git(cwd, ["show", "HEAD:package.json"]).catch(() => "");
  const scriptChanged = conformanceScript(before) !== conformanceScript(after);
  return evaluate(changes, scriptChanged, options);
};

const main = async (): Promise<number> => {
  const [, , base] = process.argv;
  if (base === undefined) {
    process.stderr.write("usage: guard.ts <base-ref>\n");
    return 2;
  }
  const steward = process.argv.includes("--steward");
  const violations = await checkChange(process.cwd(), base, { steward });
  for (const v of violations) {
    process.stderr.write(`guard: ${v.path}: ${v.reason}\n`);
  }
  if (violations.length === 0) {
    process.stdout.write("guard: ok\n");
    return 0;
  }
  return 1;
};

if (import.meta.main) {
  process.exit(await main());
}
