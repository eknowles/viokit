import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, it } from "@effect/vitest";
import { RunRecord } from "@viokit/schema";
import { Effect } from "effect";
import { makeFsRunLog, makeMemoryRunLog } from "../src/run-log.js";

const record = (runId: string, extra: Partial<RunRecord> = {}) =>
  RunRecord.make({
    addedEntities: [{ id: "a", kind: "domain" }],
    addedRelationCount: 1,
    depth: 0,
    durationMs: 5,
    inputEntityId: "example.com",
    inputKind: "domain",
    outcome: "ok",
    runId,
    startedAt: "2026-11-14T00:00:00.000Z",
    transformId: "dig-resolve",
    ...extra,
  });

const backends = [
  ["memory", () => makeMemoryRunLog()],
  [
    "filesystem",
    () => makeFsRunLog(mkdtempSync(join(tmpdir(), "viokit-runs-"))),
  ],
] as const;

for (const [name, make] of backends) {
  describe(`run log (${name})`, () => {
    it.effect("reads back what was appended, in order", () =>
      Effect.gen(function* () {
        const log = make();
        yield* log.append("case-1", record("r1"));
        yield* log.append(
          "case-1",
          record("r2", { message: "boom", outcome: "failed" })
        );
        const runs = yield* log.list("case-1");
        assert.deepStrictEqual(
          runs.map((one) => one.runId),
          ["r1", "r2"]
        );
        assert.strictEqual(runs[1]?.message, "boom");
      })
    );

    it.effect("keeps investigations apart", () =>
      Effect.gen(function* () {
        const log = make();
        yield* log.append("case-1", record("r1"));
        yield* log.append("case-2", record("r2"));
        assert.deepStrictEqual(
          (yield* log.list("case-1")).map((one) => one.runId),
          ["r1"]
        );
        assert.deepStrictEqual(yield* log.list("case-3"), []);
      })
    );
  });
}

describe("run log (filesystem durability)", () => {
  it.effect("survives a new instance over the same root", () =>
    Effect.gen(function* () {
      const root = mkdtempSync(join(tmpdir(), "viokit-runs-"));
      yield* makeFsRunLog(root).append("case-1", record("r1"));
      const again = yield* makeFsRunLog(root).list("case-1");
      assert.strictEqual(again.length, 1);
    })
  );
});
