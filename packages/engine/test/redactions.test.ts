import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, it } from "@effect/vitest";
import {
  evidenceId,
  investigationId,
  LOCAL_PRINCIPAL,
  Redaction,
  redactionId,
} from "@viokit/schema";
import { Effect } from "effect";
import { makeFsRedactionStore } from "../src/redactions.js";

/**
 * Redactions have to outlive the process (TDR-024).
 *
 * Found by running it: with an in-memory store, a redaction recorded by one CLI
 * invocation was gone by the next, so an export happily carried material
 * somebody had withheld. A governance mechanism that forgets is worse than none,
 * because it is believed.
 */

const investigation = investigationId("case-1");

const withholding = (evidence: string, reason: string) =>
  Redaction.make({
    evidenceId: evidenceId(evidence),
    ground: "third-party",
    id: redactionId(`red-${evidence}`),
    investigation,
    reason,
    redactedAt: new Date("2024-06-01T00:00:00.000Z"),
    redactedBy: LOCAL_PRINCIPAL.id,
  });

const root = () => mkdtempSync(join(tmpdir(), "viokit-red-"));

describe("redactions survive the process that made them", () => {
  it("reads back what a separate store instance wrote", async () => {
    const dir = root();

    await Effect.runPromise(
      makeFsRedactionStore(dir).redact(withholding("a".repeat(64), "a source"))
    );

    // A second store over the same root: the next process, in effect.
    const read = await Effect.runPromise(
      makeFsRedactionStore(dir).forInvestigation(investigation)
    );
    assert.strictEqual(read.length, 1);
    assert.strictEqual(read[0]?.reason, "a source");
    assert.strictEqual(read[0]?.redactedBy, LOCAL_PRINCIPAL.id);
    // Dates survive the round-trip rather than arriving as strings.
    assert.instanceOf(read[0]?.redactedAt, Date);
  });

  it("appends rather than replacing — a withholding is a fact, not a setting", async () => {
    const dir = root();
    const store = makeFsRedactionStore(dir);

    await Effect.runPromise(store.redact(withholding("a".repeat(64), "first")));
    await Effect.runPromise(
      store.redact(withholding("b".repeat(64), "second"))
    );

    const read = await Effect.runPromise(
      makeFsRedactionStore(dir).forInvestigation(investigation)
    );
    assert.deepStrictEqual(
      read.map((one) => one.reason),
      ["first", "second"]
    );
  });

  it("an investigation with nothing withheld reads as empty, not as an error", async () => {
    const read = await Effect.runPromise(
      makeFsRedactionStore(root()).forInvestigation(investigation)
    );
    assert.deepStrictEqual(read, []);
  });

  /** One case's withholdings must not appear in another's. */
  it("keeps investigations apart", async () => {
    const dir = root();
    await Effect.runPromise(
      makeFsRedactionStore(dir).redact(withholding("a".repeat(64), "mine"))
    );
    const other = await Effect.runPromise(
      makeFsRedactionStore(dir).forInvestigation(investigationId("case-2"))
    );
    assert.deepStrictEqual(other, []);
  });
});
