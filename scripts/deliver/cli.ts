import { join, resolve } from "node:path";
import { type DeliverConfig, deliver } from "./deliver.js";

const USAGE = `usage: bun scripts/deliver/cli.ts <change> [options]

Carries one OpenSpec change to the integration branch.

  --dry-run             print the commands and change nothing
  --integration <name>  integration branch (default: integration)
  --main <name>         main branch (default: main)
  --agent <cmd>         agent executable (default: claude)
  --author-model <m>    model for the author
  --reviewer-model <m>  model for the reviewer (should differ from the author)
  --max-turns <n>       author turn cap (default: 60)
  --max-budget <usd>    spend cap per agent run (default: 5)
  --retries <n>         retries after a failed gate (default: 2)
`;

const DEFAULT_TURNS = 60;
const DEFAULT_BUDGET = 5;
const DEFAULT_RETRIES = 2;

const flag = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const main = async (): Promise<number> => {
  const args = process.argv.slice(2);
  const [change] = args;
  if (
    change === undefined ||
    change.startsWith("-") ||
    args.includes("--help")
  ) {
    process.stdout.write(USAGE);
    return change === undefined ? 2 : 0;
  }
  const repo = resolve(process.cwd());
  const config: DeliverConfig = {
    agentCommand: [flag(args, "--agent") ?? "claude"],
    authorModel: flag(args, "--author-model"),
    change,
    dryRun: args.includes("--dry-run"),
    gateCommands: [
      ["bun", "run", "check"],
      ["bun", "run", "test"],
    ],
    integration: flag(args, "--integration") ?? "integration",
    log: (line) => process.stdout.write(`${line}\n`),
    mainBranch: flag(args, "--main") ?? "main",
    maxBudgetUsd: Number(flag(args, "--max-budget") ?? DEFAULT_BUDGET),
    maxTurns: Number(flag(args, "--max-turns") ?? DEFAULT_TURNS),
    repo,
    retries: Number(flag(args, "--retries") ?? DEFAULT_RETRIES),
    reviewerModel: flag(args, "--reviewer-model"),
    stateDir: join(repo, ".deliver"),
  };
  const record = await deliver(config);
  process.stdout.write(`${JSON.stringify(record, null, 2)}\n`);
  return record.outcome === "merged" || record.outcome === "dry-run" ? 0 : 1;
};

process.exit(await main());
