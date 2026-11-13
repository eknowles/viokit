import { describe, expect, it } from "@effect/vitest";
import { Engine } from "@viokit/engine";
import { manifest as webDns } from "@viokit/packs/web-dns/manifest";
import { Effect } from "effect";
import { makeAgentProgramLayer } from "../src/program.js";

/**
 * `whois` and `nmap` through the real deployment into the real sidecar:
 * dispatch, the container runner, the transform runner and the projections.
 * Opt-in: start the sidecar (`bun run sidecar up`) and set
 * VIOKIT_EXEC_CONTAINER=viokit-tools. It needs the network, and the scan
 * targets a host the nmap project publishes for testing.
 */

const container = process.env.VIOKIT_EXEC_CONTAINER;
const LIVE_TIMEOUT_MS = 180_000;
const SCANME_ADDRESS = "45.33.32.156";

const run = (id: string, input: unknown) =>
  Effect.runPromise(
    Effect.result(
      Effect.gen(function* () {
        const engine = yield* Engine;
        return yield* engine.runCatalogTransform(id, input);
      }).pipe(Effect.provide(makeAgentProgramLayer([webDns])))
    )
  );

describe.skipIf(container === undefined)("sidecar end to end (opt-in)", () => {
  it(
    "whois: projects a real registry record's name servers",
    async () => {
      const outcome = await run("whois-registration", {
        domain: "example.com",
      });
      expect(outcome._tag).toBe("Success");
      if (outcome._tag === "Success") {
        const text = JSON.stringify(outcome.success);
        expect(text).toContain("delegated-to");
        expect(text).toContain("example.com");
      }
    },
    LIVE_TIMEOUT_MS
  );

  it(
    "nmap: projects open ports and technologies from a real scan",
    async () => {
      const outcome = await run("nmap-open-ports", { ip: SCANME_ADDRESS });
      expect(outcome._tag).toBe("Success");
      if (outcome._tag === "Success") {
        const text = JSON.stringify(outcome.success);
        expect(text).toContain("hosts");
        expect(text).toContain("open-port");
      }
    },
    LIVE_TIMEOUT_MS
  );

  it("refuses an option-shaped value before anything starts", async () => {
    const outcome = await run("nmap-open-ports", { ip: "--script=exploit" });
    expect(outcome._tag).toBe("Failure");
    expect(JSON.stringify(outcome)).toContain("'ip'");
  });
});
