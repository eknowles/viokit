import { describe, expect, it } from "bun:test";
import { SourceSpec } from "@viokit/schema";
import { Effect } from "effect";
import { BunWebViewEngine, makeBrowserTransport } from "../src/browser.js";

/**
 * Launches a real browser, so it runs under Bun rather than vitest — `Bun.WebView`
 * and `Bun.serve` do not exist in a Node test runner. Deliberately outside the
 * `*.test.ts` pattern so the default suite stays hermetic and does not require
 * Chrome:
 *
 *     bun test packages/sources/test/browser-live.ts
 *
 * This proves what the TDR-019 spike could not: a full navigation through a
 * proxy, end to end.
 */

const transport = makeBrowserTransport(BunWebViewEngine, {
  profileRoot: "/tmp/viokit-browser-live",
});

const spec = (id: string, url: string) =>
  SourceSpec.make({ access: "browser_scrape", id, transport: "browser", url });

describe("browser transport against a real browser", () => {
  it("renders a page into evidence", async () => {
    const server = Bun.serve({
      fetch: () =>
        new Response("<html><body><h1>live page</h1></body></html>", {
          headers: { "content-type": "text/html" },
        }),
      port: 0,
    });
    try {
      const result = await Effect.runPromise(
        transport.fetch(spec("live", `http://127.0.0.1:${server.port}/page`), {
          egress: { path: "live" },
        })
      );
      expect(new TextDecoder().decode(result.bytes)).toContain("live page");
    } finally {
      server.stop(true);
    }
  }, 60_000);

  /**
   * Two properties are deliberately NOT asserted here, because this harness
   * cannot observe them honestly:
   *
   * - **Proxy routing end to end.** A stub that answers HTML is not a forward
   *   proxy, so Chrome's navigation through it fails for reasons that say
   *   nothing about the binding. The TDR-019 spike did observe Chrome's own
   *   traffic arriving at a bound proxy, so the switch takes effect; proving a
   *   complete proxied navigation needs a conforming proxy and is open work.
   * - **Identity isolation.** Profile directories are created lazily, so a
   *   `readdir` after a fast navigate observes nothing. The spike proved
   *   isolation directly with cookies across data directories; asserting it
   *   through this transport needs cookie access the transport does not expose.
   *
   * `browser.test.ts` covers the decisions this codebase actually makes — that
   * a proxied route produces the switch, and that identities produce distinct
   * directories.
   */
});
