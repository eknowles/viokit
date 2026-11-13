import { execFileSync } from "node:child_process";
import { describe, expect, it } from "@effect/vitest";
import { Engine } from "@viokit/engine";
import { manifest as webDns } from "@viokit/packs/web-dns/manifest";
import { Effect } from "effect";
import { makeAgentProgramLayer } from "../src/program.js";

/**
 * The real `dig`, through the real deployment: dispatch, host runner, the
 * transform runner and the projection. Skipped where `dig` is not installed.
 *
 * It must not depend on the network. With a resolver, the answer is projected;
 * without one `dig` itself fails, and that failure arrives through the pipeline
 * as the tool's status, which still proves the command ran end to end.
 */

const hasDig = (() => {
  try {
    execFileSync("dig", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

const LIVE_TIMEOUT_MS = 30_000;
const DIG_FAILURE = /command 'dig' exited with status \d+|timed out/;

describe("dig end to end", () => {
  it.skipIf(!hasDig)(
    "runs dig and either projects its answer or reports its status",
    async () => {
      const outcome = await Effect.runPromise(
        Effect.result(
          Effect.gen(function* () {
            const engine = yield* Engine;
            return yield* engine.runCatalogTransform("dig-resolve", {
              domain: "example.com",
            });
          }).pipe(Effect.provide(makeAgentProgramLayer([webDns])))
        )
      );
      if (outcome._tag === "Success") {
        // An answer was projected; an empty one derives no steps at all.
        expect(outcome.success.length).toBeGreaterThan(0);
        expect(JSON.stringify(outcome.success)).toContain("resolves-to");
        return;
      }
      expect(JSON.stringify(outcome.failure)).toMatch(DIG_FAILURE);
    },
    LIVE_TIMEOUT_MS
  );

  it.skipIf(!hasDig)(
    "refuses an option-shaped domain before dig is started",
    async () => {
      const outcome = await Effect.runPromise(
        Effect.result(
          Effect.gen(function* () {
            const engine = yield* Engine;
            return yield* engine.runCatalogTransform("dig-resolve", {
              domain: "-f/etc/passwd",
            });
          }).pipe(Effect.provide(makeAgentProgramLayer([webDns])))
        )
      );
      expect(outcome._tag).toBe("Failure");
      expect(JSON.stringify(outcome)).toContain("'domain'");
    }
  );
});
