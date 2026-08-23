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
 *     bun test ./packages/sources/test/browser-live.ts
 *
 * These are the end-to-end proofs the launch-option tests cannot give: that a
 * proxied acquisition really is routed through its proxy (I10), and that two
 * identities really do not share a session (TDR-011).
 */

const profileRoot = "/tmp/viokit-browser-live";
const transport = makeBrowserTransport(BunWebViewEngine, { profileRoot });

const spec = (id: string, url: string) =>
  SourceSpec.make({ access: "browser_scrape", id, transport: "browser", url });

const html = (body: string) =>
  new Response(`<html><body>${body}</body></html>`, {
    headers: { "content-type": "text/html" },
  });

describe("browser transport against a real browser", () => {
  it("renders a page into evidence", async () => {
    const server = Bun.serve({
      fetch: () => html("<h1>live page</h1>"),
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
   * **Finding (2026-08-23): proxy binding is per browser *process*, not per
   * view.** `--proxy-server` is a launch switch, and `Bun.WebView` reuses a
   * browser process across views — so an acquisition run after another one
   * silently inherits the first process's route.
   *
   * Measured: the identical proxied acquisition routes through its proxy when
   * it is the first thing to launch a browser, and never reaches the proxy when
   * another acquisition ran first.
   *
   * The transport therefore **refuses** proxied browser acquisition
   * (`browser-launch.ts`) rather than promising a route it cannot guarantee —
   * traffic leaving by the wrong route while the evidence recorded `proxy` is
   * exactly the bypass I10 forbids. Direct-egress browser acquisition is
   * unaffected and proven above.
   *
   * Session isolation is likewise not asserted here: it is a property of the
   * profile directory, which the same process reuse makes unobservable through
   * this transport. The TDR-019 spike proved it directly with cookies across
   * data directories.
   *
   * Re-enabling proxied browser work means a process per route — see TDR-019's
   * open questions.
   */
});
