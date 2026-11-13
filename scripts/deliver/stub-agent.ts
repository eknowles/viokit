/**
 * A stand-in for the real agent, so the orchestrator's loop can be tested
 * without a model. Behaviour is chosen by environment variables:
 *   STUB_MODE   success | break | fix-second | edit-guard | edit-vocabulary | none
 *   STUB_REVIEW approve | reject | garbage | high
 *   STUB_STATE  a directory for counters and the recorded argv
 * Reviewer runs are recognised by the --json-schema flag.
 */
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const state = process.env.STUB_STATE ?? ".";
const isReviewer = argv.includes("--json-schema");
appendFileSync(
  join(state, "argv.log"),
  `${JSON.stringify({ argv, role: isReviewer ? "reviewer" : "author" })}\n`
);

const sh = (...cmd: string[]) => {
  const proc = Bun.spawnSync(cmd, { stderr: "pipe", stdout: "pipe" });
  if (proc.exitCode !== 0) {
    throw new Error(`${cmd.join(" ")}: ${proc.stderr.toString()}`);
  }
};

const commit = (message: string) => {
  sh("git", "add", "-A");
  sh(
    "git",
    "-c",
    "user.name=stub",
    "-c",
    "user.email=stub@localhost",
    "commit",
    "-q",
    "-m",
    message
  );
};

const attemptNumber = (): number => {
  const path = join(state, "attempts");
  const n = (existsSync(path) ? Number(readFileSync(path, "utf8")) : 0) + 1;
  writeFileSync(path, String(n));
  return n;
};

const reviewer = () => {
  const mode = process.env.STUB_REVIEW ?? "approve";
  if (mode === "garbage") {
    process.stdout.write(JSON.stringify({ result: "looks fine to me" }));
    return;
  }
  const verdict =
    mode === "approve"
      ? { approve: true, findings: [] }
      : {
          approve: mode !== "reject",
          findings: [{ severity: "high", summary: "a defect" }],
        };
  process.stdout.write(
    JSON.stringify({ structured_output: verdict, total_cost_usd: 0.01 })
  );
};

const author = () => {
  const mode = process.env.STUB_MODE ?? "success";
  const n = attemptNumber();
  if (mode === "success" || (mode === "fix-second" && n >= 2)) {
    writeFileSync("delivered.txt", "done\n");
    commit("deliver: stub work");
  } else if (mode === "break" || mode === "fix-second") {
    writeFileSync("broken.txt", "this breaks the gate\n");
    commit("deliver: stub work that breaks the gate");
  } else if (mode === "edit-vocabulary") {
    writeFileSync(
      "packages/vocabulary/src/vocabulary.ts",
      "export const x = 2;\n"
    );
    commit("deliver: stub edits the vocabulary");
  } else if (mode === "edit-guard") {
    writeFileSync("conformance/guard.ts", "process.exit(0);\n");
    writeFileSync("delivered.txt", "done\n");
    commit("deliver: stub weakens the guard");
  }
  process.stdout.write(
    JSON.stringify({ result: "done", session_id: "stub", total_cost_usd: 0.02 })
  );
};

if (isReviewer) {
  reviewer();
} else {
  author();
}
