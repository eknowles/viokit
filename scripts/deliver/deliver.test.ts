import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  authorArgs,
  blocks,
  type DeliverConfig,
  deliver,
  parseVerdict,
  reviewerArgs,
} from "./deliver.js";

const ROOT = resolve(import.meta.dir, "../..");
const STUB = join(ROOT, "scripts/deliver/stub-agent.ts");
const temp: string[] = [];

const sh = async (cwd: string, ...cmd: string[]): Promise<string> => {
  const proc = Bun.spawn(cmd, { cwd, stderr: "pipe", stdout: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`${cmd.join(" ")}: ${err}`);
  }
  return out;
};

interface Fixture {
  readonly config: DeliverConfig;
  readonly lines: string[];
  readonly repo: string;
  readonly state: string;
}

const makeFixture = async (
  overrides: Partial<DeliverConfig> = {}
): Promise<Fixture> => {
  const repo = await mkdtemp(join(tmpdir(), "deliver-repo-"));
  const state = await mkdtemp(join(tmpdir(), "deliver-state-"));
  temp.push(repo, state);
  await sh(repo, "git", "init", "-q", "-b", "main");
  await sh(repo, "git", "config", "user.email", "t@example.com");
  await sh(repo, "git", "config", "user.name", "t");
  await mkdir(join(repo, "conformance"), { recursive: true });
  await cp(
    join(ROOT, "conformance/guard.ts"),
    join(repo, "conformance/guard.ts")
  );
  await mkdir(join(repo, "packages/vocabulary/src"), { recursive: true });
  await writeFile(
    join(repo, "packages/vocabulary/src/vocabulary.ts"),
    "export const x = 1;\n"
  );
  await mkdir(join(repo, "openspec/changes/demo"), { recursive: true });
  await mkdir(join(repo, "openspec/changes/vocabulary-add"), {
    recursive: true,
  });
  await writeFile(
    join(repo, "openspec/changes/vocabulary-add/tasks.md"),
    "- [ ] 1.1 add\n"
  );
  await writeFile(
    join(repo, "openspec/changes/demo/tasks.md"),
    "- [ ] 1.1 do it\n"
  );
  await writeFile(
    join(repo, "package.json"),
    JSON.stringify({ scripts: { conformance: "true" } })
  );
  await sh(repo, "git", "add", "-A");
  await sh(repo, "git", "commit", "-q", "-m", "base");
  const lines: string[] = [];
  const config: DeliverConfig = {
    agentCommand: ["bun", STUB],
    authorModel: "author-model",
    change: "demo",
    dryRun: false,
    gateCommands: [["sh", "-c", "test ! -e broken.txt"]],
    integration: "integration",
    log: (line) => lines.push(line),
    mainBranch: "main",
    maxBudgetUsd: 1,
    maxTurns: 5,
    repo,
    retries: 1,
    reviewerModel: "reviewer-model",
    stateDir: join(state, "deliver"),
    ...overrides,
  };
  process.env.STUB_STATE = state;
  return { config, lines, repo, state };
};

const branchTip = async (repo: string, branch: string) =>
  (await sh(repo, "git", "rev-parse", branch)).trim();

beforeEach(() => {
  process.env.STUB_MODE = "success";
  process.env.STUB_REVIEW = "approve";
});

afterAll(async () => {
  await Promise.all(temp.map((p) => rm(p, { force: true, recursive: true })));
});

describe("delivery orchestrator", () => {
  it("merges a passing change into integration and leaves main alone", async () => {
    const { config, repo } = await makeFixture();
    const mainBefore = await branchTip(repo, "main");
    const record = await deliver(config);
    expect(record.outcome).toBe("merged");
    expect(await branchTip(repo, "main")).toBe(mainBefore);
    const log = await sh(
      repo,
      "git",
      "log",
      "--merges",
      "--format=%s",
      "integration"
    );
    expect(log).toContain("deliver: demo");
    const files = await sh(
      repo,
      "git",
      "ls-tree",
      "-r",
      "--name-only",
      "integration"
    );
    expect(files).toContain("delivered.txt");
  });

  it("starts the author's branch at the integration tip", async () => {
    const { config, repo } = await makeFixture();
    await sh(repo, "git", "branch", "integration", "main");
    await sh(repo, "git", "switch", "-q", "integration");
    await writeFile(join(repo, "marker.txt"), "m\n");
    await sh(repo, "git", "add", "-A");
    await sh(repo, "git", "commit", "-q", "-m", "integration work");
    await sh(repo, "git", "switch", "-q", "main");
    const record = await deliver(config);
    expect(record.outcome).toBe("merged");
    const base = await sh(
      repo,
      "git",
      "merge-base",
      "agent/demo",
      "integration~1"
    );
    expect(base.trim()).toBe(await branchTip(repo, "integration~1"));
  });

  it("lets only one run claim a change, and releases the claim", async () => {
    const { config, state } = await makeFixture();
    await mkdir(join(config.stateDir, "claims", "demo"), { recursive: true });
    await writeFile(
      join(config.stateDir, "claims", "demo", "holder.json"),
      '{"pid":1}'
    );
    const second = await deliver(config);
    expect(second.outcome).toBe("claimed");
    expect(second.holder).toContain("pid");
    await rm(join(config.stateDir, "claims", "demo"), { recursive: true });
    const third = await deliver(config);
    expect(third.outcome).toBe("merged");
    expect(await readdir(join(state, "deliver", "claims"))).not.toContain(
      "demo"
    );
  });

  it("fails the gate even though the author reports success", async () => {
    process.env.STUB_MODE = "break";
    const { config, repo } = await makeFixture();
    const record = await deliver(config);
    expect(record.outcome).toBe("failed-gate");
    expect(record.attempts).toBe(2);
    expect(record.failure?.gate).toContain("broken.txt");
    const branches = await sh(repo, "git", "branch", "--list", "agent/demo");
    expect(branches).toContain("agent/demo");
    const files = await sh(
      repo,
      "git",
      "ls-tree",
      "-r",
      "--name-only",
      "integration"
    ).catch(() => "");
    expect(files).not.toContain("broken.txt");
  });

  it("succeeds when a retry fixes the failure", async () => {
    process.env.STUB_MODE = "fix-second";
    const { config } = await makeFixture();
    // the second attempt must remove the file the first created
    const record = await deliver({
      ...config,
      gateCommands: [["sh", "-c", "rm -f broken.txt; test -e delivered.txt"]],
    });
    expect(record.outcome).toBe("merged");
    expect(record.attempts).toBe(2);
  });

  it("judges an edited guard by the integration branch's copy", async () => {
    process.env.STUB_MODE = "edit-guard";
    const { config } = await makeFixture();
    const record = await deliver(config);
    expect(record.outcome).toBe("failed-gate");
    expect(record.failure?.gate).toBe("guard");
    expect(record.failure?.output).toContain("conformance/guard.ts");
  });

  for (const mode of ["reject", "garbage", "high"]) {
    it(`does not merge when the reviewer verdict is ${mode}`, async () => {
      process.env.STUB_REVIEW = mode;
      const { config, repo } = await makeFixture();
      const record = await deliver(config);
      expect(record.outcome).toBe("rejected");
      const merges = await sh(
        repo,
        "git",
        "log",
        "--merges",
        "--format=%s",
        "integration"
      );
      expect(merges.trim()).toBe("");
    });
  }

  it("rejects a vocabulary edit by an ordinary change", async () => {
    process.env.STUB_MODE = "edit-vocabulary";
    const { config } = await makeFixture();
    const record = await deliver(config);
    expect(record.outcome).toBe("failed-gate");
    expect(record.failure?.gate).toBe("guard");
    expect(record.failure?.output).toContain("packages/vocabulary");
  });

  it("allows a vocabulary edit by a change named as a vocabulary change", async () => {
    process.env.STUB_MODE = "edit-vocabulary";
    const { config } = await makeFixture({ change: "vocabulary-add" });
    const record = await deliver(config);
    expect(record.outcome).toBe("merged");
  });

  it("passes the exact caps and permissions, with no push and no edit tools for the reviewer", async () => {
    const { config, state } = await makeFixture();
    await deliver(config);
    const log = (await readFile(join(state, "argv.log"), "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { argv: string[]; role: string });
    const author = log.find((e) => e.role === "author")?.argv ?? [];
    const reviewer = log.find((e) => e.role === "reviewer")?.argv ?? [];
    expect(author).toContain("dontAsk");
    expect(author).toContain("--max-turns");
    expect(author).toContain("--max-budget-usd");
    expect(author.join(" ")).toContain("--permission-prompts none");
    expect(author.join(" ")).not.toContain("git push");
    expect(author).toContain("author-model");
    expect(reviewer.join(" ")).toContain("--disallowedTools Edit Write Bash");
    expect(reviewer).toContain("reviewer-model");
    expect(reviewer).not.toContain("author-model");
  });

  it("makes no change in dry-run mode", async () => {
    const { config, lines, repo, state } = await makeFixture({ dryRun: true });
    const before = {
      branches: await sh(repo, "git", "branch", "--list"),
      status: await sh(repo, "git", "status", "--porcelain"),
    };
    const record = await deliver(config);
    expect(record.outcome).toBe("dry-run");
    expect(lines.some((l) => l.includes("--max-budget-usd"))).toBe(true);
    expect(await sh(repo, "git", "branch", "--list")).toBe(before.branches);
    expect(await sh(repo, "git", "status", "--porcelain")).toBe(before.status);
    expect(await readdir(state)).not.toContain("deliver");
  });

  it("records a failed run with its failing output", async () => {
    process.env.STUB_MODE = "break";
    const { config, state } = await makeFixture();
    await deliver(config);
    const runs = await readdir(join(state, "deliver", "runs"));
    const record = JSON.parse(
      await readFile(join(state, "deliver", "runs", runs[0] ?? ""), "utf8")
    ) as { outcome: string; failure: { gate: string } };
    expect(record.outcome).toBe("failed-gate");
    expect(record.failure.gate).toContain("broken.txt");
  });
});

describe("pure helpers", () => {
  it("blocks on no verdict, a rejection, or a high-severity finding", () => {
    expect(blocks(undefined)).toBe(true);
    expect(blocks({ approve: false, findings: [] })).toBe(true);
    expect(
      blocks({ approve: true, findings: [{ severity: "high", summary: "x" }] })
    ).toBe(true);
    expect(
      blocks({ approve: true, findings: [{ severity: "low", summary: "x" }] })
    ).toBe(false);
  });

  it("reads a verdict from structured output or a JSON result", () => {
    expect(
      parseVerdict('{"structured_output":{"approve":true,"findings":[]}}')
    ).toEqual({
      approve: true,
      findings: [],
    });
    expect(
      parseVerdict('{"result":"{\\"approve\\":false,\\"findings\\":[]}"}')
        ?.approve
    ).toBe(false);
    expect(parseVerdict("not json")).toBeUndefined();
    expect(parseVerdict('{"result":"fine"}')).toBeUndefined();
  });

  it("builds argument lists without a shell string", () => {
    const base = {
      agentCommand: ["claude"],
      change: "c",
      dryRun: false,
      gateCommands: [],
      integration: "integration",
      log: () => undefined,
      mainBranch: "main",
      maxBudgetUsd: 2,
      maxTurns: 7,
      repo: ".",
      retries: 0,
      stateDir: ".",
    } satisfies DeliverConfig;
    expect(authorArgs(base, "p")[0]).toBe("claude");
    expect(reviewerArgs(base, "p")).toContain("--json-schema");
  });
});
