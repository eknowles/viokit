import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunLog } from "@viokit/schema";
import { RunLogService, RunRecord } from "@viokit/schema";
import { Effect, Layer, Schema } from "effect";
import { fnv1aHex } from "./hash.js";

/**
 * Run records for the investigation tree: one append-only JSON-lines file per
 * investigation, apart from the evidence store and the step log. The step log
 * holds assertions about the world; this holds orchestration (which entity led
 * to which run, how it ended, how long it took, including runs that failed and
 * derived nothing).
 */

export const defaultRunLogRoot = "./.viokit/runs";

const decodeRecord = Schema.decodeUnknownSync(RunRecord);
const encodeText = new TextEncoder();

/** Hashed, so an investigation id cannot escape the root or collide. */
const fileFor = (root: string, investigation: string): string =>
  join(root, `${fnv1aHex(encodeText.encode(investigation))}.jsonl`);

export const makeMemoryRunLog = (): RunLog => {
  const byInvestigation = new Map<string, RunRecord[]>();
  return {
    append: (investigation, record) =>
      Effect.sync(() => {
        const existing = byInvestigation.get(investigation) ?? [];
        byInvestigation.set(investigation, [...existing, record]);
      }),
    list: (investigation) =>
      Effect.sync(() => [...(byInvestigation.get(investigation) ?? [])]),
  };
};

export const makeFsRunLog = (root: string): RunLog => ({
  append: (investigation, record) =>
    Effect.promise(async () => {
      await mkdir(root, { recursive: true });
      await appendFile(
        fileFor(root, investigation),
        `${JSON.stringify(Schema.encodeSync(RunRecord)(record))}\n`
      );
    }),
  list: (investigation) =>
    Effect.promise(async () => {
      const text = await readFile(fileFor(root, investigation), "utf8").catch(
        () => ""
      );
      return text
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => decodeRecord(JSON.parse(line)));
    }),
});

export const makeRunLogLayer = (root: string): Layer.Layer<RunLogService> =>
  Layer.sync(RunLogService, () => makeFsRunLog(root));

export const MemoryRunLogLayer: Layer.Layer<RunLogService> = Layer.sync(
  RunLogService,
  makeMemoryRunLog
);
