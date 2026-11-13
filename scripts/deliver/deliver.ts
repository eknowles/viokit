import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Carries one OpenSpec change to the integration branch with no human input:
 * claim -> author in a worktree -> gates -> reviewer -> merge -> record.
 * See openspec/changes/delivery-orchestrator for the contract.
 *
 * The gates are the only truth. Nothing here infers success from the author's
 * exit code or from fields the CLI does not document.
 */

export interface DeliverConfig {
  /** The agent executable and any fixed leading arguments, e.g. ["claude"]. */
  readonly agentCommand: readonly string[];
  readonly authorModel?: string | undefined;
  readonly change: string;
  readonly dryRun: boolean;
  readonly gateCommands: readonly (readonly string[])[];
  readonly integration: string;
  readonly log: (line: string) => void;
  readonly mainBranch: string;
  readonly maxBudgetUsd: number;
  readonly maxTurns: number;
  readonly repo: string;
  readonly retries: number;
  readonly reviewerModel?: string | undefined;
  /** Where claims, worktrees and run records live (gitignored). */
  readonly stateDir: string;
}

export type Outcome =
  | "merged"
  | "failed-gate"
  | "rejected"
  | "claimed"
  | "dry-run"
  | "error";

export interface RunRecord {
  readonly attempts: number;
  readonly change: string;
  readonly costUsd: number | undefined;
  readonly failure?:
    | { readonly gate: string; readonly output: string }
    | undefined;
  readonly holder?: string | undefined;
  readonly message?: string | undefined;
  readonly outcome: Outcome;
  readonly verdict?: Verdict | undefined;
}

export interface Finding {
  readonly severity: string;
  readonly summary: string;
}

export interface Verdict {
  readonly approve: boolean;
  readonly findings: readonly Finding[];
}

interface Exec {
  readonly code: number;
  readonly stderr: string;
  readonly stdout: string;
}

const AUTHOR_ALLOW = [
  "Read",
  "Edit",
  "Write",
  "Glob",
  "Grep",
  "Bash(git add *)",
  "Bash(git commit *)",
  "Bash(git status *)",
  "Bash(git diff *)",
  "Bash(bun test *)",
  "Bash(bun run *)",
  "Bash(npm exec -- ultracite *)",
  "Bash(openspec *)",
  "Bash(npx tsc *)",
] as const;

const REVIEWER_ALLOW = ["Read", "Grep", "Glob"] as const;
const REVIEWER_DENY = ["Edit", "Write", "Bash"] as const;
const MAX_REVIEW_TURNS = 10;
/** Only a change named like this may edit the shared vocabulary. */
const STEWARD_PREFIX = "vocabulary-";
const OUTPUT_EXCERPT = 4000;
const MERGE_LOCK_ATTEMPTS = 50;
const MERGE_LOCK_WAIT_MS = 100;

export const VERDICT_SCHEMA = {
  properties: {
    approve: { type: "boolean" },
    findings: {
      items: {
        properties: {
          severity: { enum: ["low", "medium", "high"], type: "string" },
          summary: { type: "string" },
        },
        required: ["severity", "summary"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["approve", "findings"],
  type: "object",
} as const;

const exec = async (
  argv: readonly string[],
  cwd: string,
  env?: Record<string, string>
): Promise<Exec> => {
  const proc = Bun.spawn([...argv], {
    cwd,
    env: { ...process.env, ...env },
    stderr: "pipe",
    stdout: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stderr, stdout };
};

const excerpt = (text: string): string =>
  text.length > OUTPUT_EXCERPT ? text.slice(-OUTPUT_EXCERPT) : text;

const git = (cwd: string, ...args: string[]) => exec(["git", ...args], cwd);

const gitOrThrow = async (cwd: string, ...args: string[]): Promise<string> => {
  const result = await git(cwd, ...args);
  if (result.code !== 0) {
    throw new Error(`git ${args.join(" ")}: ${result.stderr.trim()}`);
  }
  return result.stdout;
};

export const authorArgs = (
  config: DeliverConfig,
  prompt: string
): readonly string[] => [
  ...config.agentCommand,
  "-p",
  prompt,
  "--permission-mode",
  "dontAsk",
  "--permission-prompts",
  "none",
  "--allowedTools",
  ...AUTHOR_ALLOW,
  "--max-turns",
  String(config.maxTurns),
  "--max-budget-usd",
  String(config.maxBudgetUsd),
  "--output-format",
  "json",
  ...(config.authorModel === undefined ? [] : ["--model", config.authorModel]),
];

export const reviewerArgs = (
  config: DeliverConfig,
  prompt: string
): readonly string[] => [
  ...config.agentCommand,
  "-p",
  prompt,
  "--permission-mode",
  "dontAsk",
  "--permission-prompts",
  "none",
  "--allowedTools",
  ...REVIEWER_ALLOW,
  "--disallowedTools",
  ...REVIEWER_DENY,
  "--max-turns",
  String(MAX_REVIEW_TURNS),
  "--max-budget-usd",
  String(config.maxBudgetUsd),
  "--output-format",
  "json",
  "--json-schema",
  JSON.stringify(VERDICT_SCHEMA),
  ...(config.reviewerModel === undefined
    ? []
    : ["--model", config.reviewerModel]),
];

const authorPrompt = (change: string, failure?: string): string =>
  failure === undefined
    ? `/opsx:apply ${change}`
    : `/opsx:apply ${change}\n\nThe previous attempt failed this gate. Fix it, do not weaken tests or conformance rules:\n${failure}`;

const reviewerPrompt = (change: string, diff: string): string =>
  `Review the change "${change}" as an independent reviewer. You have read-only tools. Check the diff against the change's specs in openspec/changes/${change}/. Report correctness defects only, with a severity. Reply with JSON matching the schema.\n\n${diff}`;

const readJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const costOf = (stdout: string): number | undefined => {
  const parsed = readJson(stdout) as { total_cost_usd?: unknown } | undefined;
  return typeof parsed?.total_cost_usd === "number"
    ? parsed.total_cost_usd
    : undefined;
};

const isFinding = (value: unknown): value is Finding => {
  const f = value as Partial<Finding> | null;
  return (
    typeof f === "object" &&
    f !== null &&
    typeof f.severity === "string" &&
    typeof f.summary === "string"
  );
};

/** Accepts a verdict from `structured_output` or from a JSON `result`. */
export const parseVerdict = (stdout: string): Verdict | undefined => {
  const outer = readJson(stdout) as
    | { result?: unknown; structured_output?: unknown }
    | undefined;
  const candidate =
    outer?.structured_output ??
    (typeof outer?.result === "string"
      ? readJson(outer.result)
      : outer?.result);
  const v = candidate as Partial<Verdict> | undefined;
  if (
    typeof v?.approve === "boolean" &&
    Array.isArray(v.findings) &&
    v.findings.every(isFinding)
  ) {
    return { approve: v.approve, findings: v.findings };
  }
};

export const blocks = (verdict: Verdict | undefined): boolean =>
  verdict === undefined ||
  !verdict.approve ||
  verdict.findings.some((f) => f.severity === "high");

const claimPath = (config: DeliverConfig, name: string) =>
  join(config.stateDir, "claims", name);

const takeClaim = async (
  config: DeliverConfig
): Promise<{ readonly ok: boolean; readonly holder?: string }> => {
  await mkdir(join(config.stateDir, "claims"), { recursive: true });
  const path = claimPath(config, config.change);
  try {
    await mkdir(path);
  } catch {
    const holder = await Bun.file(join(path, "holder.json"))
      .text()
      .catch(() => "unknown");
    return { holder, ok: false };
  }
  await writeFile(
    join(path, "holder.json"),
    JSON.stringify({ at: new Date().toISOString(), pid: process.pid })
  );
  return { ok: true };
};

const releaseClaim = (config: DeliverConfig) =>
  rm(claimPath(config, config.change), { force: true, recursive: true });

const runGates = async (
  config: DeliverConfig,
  worktree: string
): Promise<{ readonly gate: string; readonly output: string } | undefined> => {
  for (const argv of config.gateCommands) {
    // biome-ignore lint/performance/noAwaitInLoops: gates are ordered, cheapest first, and stop at the first failure
    const result = await exec(argv, worktree);
    if (result.code !== 0) {
      return {
        gate: argv.join(" "),
        output: excerpt(result.stdout + result.stderr),
      };
    }
  }
  // The guard comes from the integration branch's copy, never the author's.
  const source = await git(
    worktree,
    "show",
    `${config.integration}:conformance/guard.ts`
  );
  if (source.code !== 0) {
    return {
      gate: "guard",
      output: "conformance/guard.ts not found on the integration branch",
    };
  }
  const dir = await mkdtemp(join(tmpdir(), "deliver-guard-"));
  try {
    const path = join(dir, "guard.ts");
    await writeFile(path, source.stdout);
    const steward = config.change.startsWith(STEWARD_PREFIX);
    const result = await exec(
      ["bun", path, config.integration, ...(steward ? ["--steward"] : [])],
      worktree
    );
    if (result.code !== 0) {
      return { gate: "guard", output: excerpt(result.stdout + result.stderr) };
    }
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
};

const commitLeftovers = async (worktree: string) => {
  const status = await gitOrThrow(worktree, "status", "--porcelain");
  if (status.trim().length === 0) {
    return;
  }
  await gitOrThrow(worktree, "add", "-A");
  await gitOrThrow(
    worktree,
    "-c",
    "user.name=deliver",
    "-c",
    "user.email=deliver@localhost",
    "commit",
    "-q",
    "-m",
    "chore(deliver): uncommitted author changes"
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const withMergeLock = async <T>(
  config: DeliverConfig,
  work: () => Promise<T>
): Promise<T> => {
  const path = claimPath(config, "_merge");
  for (let attempt = 0; attempt < MERGE_LOCK_ATTEMPTS; attempt += 1) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: polling for a lock is inherently sequential
      await mkdir(path);
      try {
        return await work();
      } finally {
        await rm(path, { force: true, recursive: true });
      }
    } catch (error) {
      if (!existsSync(path)) {
        throw error;
      }
      await sleep(MERGE_LOCK_WAIT_MS);
    }
  }
  throw new Error("could not take the merge lock");
};

const mergeIntoIntegration = async (
  config: DeliverConfig,
  branch: string
): Promise<string | undefined> => {
  const path = join(config.stateDir, "worktrees", "_integration");
  return await withMergeLock(config, async () => {
    if (!existsSync(path)) {
      await gitOrThrow(
        config.repo,
        "worktree",
        "add",
        "-q",
        path,
        config.integration
      );
    }
    const merge = await git(
      path,
      "-c",
      "user.name=deliver",
      "-c",
      "user.email=deliver@localhost",
      "merge",
      "--no-ff",
      "-m",
      `deliver: ${config.change}`,
      branch
    );
    if (merge.code !== 0) {
      await git(path, "merge", "--abort");
      return excerpt(merge.stdout + merge.stderr);
    }
  });
};

const writeRecord = async (
  config: DeliverConfig,
  record: RunRecord
): Promise<void> => {
  const dir = join(config.stateDir, "runs");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  await writeFile(
    join(dir, `${config.change}-${stamp}.json`),
    JSON.stringify(record, null, 2)
  );
};

const dryRun = (config: DeliverConfig): RunRecord => {
  const branch = `agent/${config.change}`;
  const worktree = join(config.stateDir, "worktrees", config.change);
  const lines = [
    `git worktree add -b ${branch} ${worktree} ${config.integration}`,
    authorArgs(config, authorPrompt(config.change)).join(" "),
    ...config.gateCommands.map((argv) => argv.join(" ")),
    `git show ${config.integration}:conformance/guard.ts | bun - ${config.integration}`,
    reviewerArgs(config, reviewerPrompt(config.change, "<diff>")).join(" "),
    `git merge --no-ff ${branch}  (into ${config.integration})`,
  ];
  for (const line of lines) {
    config.log(`[dry-run] ${line}`);
  }
  return {
    attempts: 0,
    change: config.change,
    costUsd: undefined,
    outcome: "dry-run",
  };
};

const ensureIntegration = async (config: DeliverConfig) => {
  const exists = await git(
    config.repo,
    "rev-parse",
    "--verify",
    "-q",
    config.integration
  );
  if (exists.code !== 0) {
    await gitOrThrow(
      config.repo,
      "branch",
      config.integration,
      config.mainBranch
    );
  }
};

interface AuthorResult {
  readonly attempts: number;
  readonly cost: number | undefined;
  readonly failure?:
    | { readonly gate: string; readonly output: string }
    | undefined;
}

const addCost = (a: number | undefined, b: number | undefined) =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);

const authorWithRetries = async (
  config: DeliverConfig,
  worktree: string
): Promise<AuthorResult> => {
  let cost: number | undefined;
  let failure: AuthorResult["failure"];
  for (let attempt = 1; attempt <= config.retries + 1; attempt += 1) {
    const prompt = authorPrompt(
      config.change,
      failure === undefined ? undefined : `${failure.gate}\n${failure.output}`
    );
    // biome-ignore lint/performance/noAwaitInLoops: each retry depends on the previous attempt's failure
    const run = await exec(authorArgs(config, prompt), worktree);
    cost = addCost(cost, costOf(run.stdout));
    await commitLeftovers(worktree);
    failure = await runGates(config, worktree);
    if (failure === undefined) {
      return { attempts: attempt, cost };
    }
    config.log(`attempt ${attempt} failed gate: ${failure.gate}`);
  }
  return { attempts: config.retries + 1, cost, failure };
};

export const deliver = async (config: DeliverConfig): Promise<RunRecord> => {
  if (config.dryRun) {
    return dryRun(config);
  }
  const claim = await takeClaim(config);
  if (!claim.ok) {
    return {
      attempts: 0,
      change: config.change,
      costUsd: undefined,
      holder: claim.holder,
      outcome: "claimed",
    };
  }
  let record: RunRecord = {
    attempts: 0,
    change: config.change,
    costUsd: undefined,
    outcome: "error",
  };
  try {
    record = await runClaimed(config);
  } catch (error) {
    record = {
      ...record,
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await releaseClaim(config);
  }
  await writeRecord(config, record);
  return record;
};

const runClaimed = async (config: DeliverConfig): Promise<RunRecord> => {
  await ensureIntegration(config);
  const branch = `agent/${config.change}`;
  const worktree = join(config.stateDir, "worktrees", config.change);
  await gitOrThrow(
    config.repo,
    "worktree",
    "add",
    "-q",
    "-b",
    branch,
    worktree,
    config.integration
  );

  const authored = await authorWithRetries(config, worktree);
  if (authored.failure !== undefined) {
    return {
      attempts: authored.attempts,
      change: config.change,
      costUsd: authored.cost,
      failure: authored.failure,
      outcome: "failed-gate",
    };
  }

  const diff = await gitOrThrow(
    worktree,
    "diff",
    `${config.integration}...HEAD`
  );
  const review = await exec(
    reviewerArgs(config, reviewerPrompt(config.change, diff)),
    worktree
  );
  const verdict = parseVerdict(review.stdout);
  const cost = addCost(authored.cost, costOf(review.stdout));
  if (blocks(verdict)) {
    return {
      attempts: authored.attempts,
      change: config.change,
      costUsd: cost,
      message:
        verdict === undefined
          ? "reviewer returned no valid verdict"
          : "reviewer did not approve",
      outcome: "rejected",
      verdict,
    };
  }

  const conflict = await mergeIntoIntegration(config, branch);
  if (conflict !== undefined) {
    return {
      attempts: authored.attempts,
      change: config.change,
      costUsd: cost,
      failure: { gate: "merge", output: conflict },
      message: `merge conflict: ${conflict}`,
      outcome: "failed-gate",
      verdict,
    };
  }
  await git(config.repo, "worktree", "remove", "--force", worktree);
  return {
    attempts: authored.attempts,
    change: config.change,
    costUsd: cost,
    outcome: "merged",
    verdict,
  };
};
