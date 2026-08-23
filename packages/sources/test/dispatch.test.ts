import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { assert, describe, it } from "@effect/vitest";
import { SourceSpec, SourceTransportService } from "@viokit/schema";
import { Effect, Layer } from "effect";
import type { BrowserEngine } from "../src/browser.js";
import { BrowserEngineService } from "../src/browser.js";
import { DispatchTransportLayer } from "../src/dispatch.js";

/**
 * The transport every real deployment actually uses, and which had no test.
 *
 * The gap it hid: dispatch reads the browser engine from its *own* construction
 * context, so a deployment that merged the engine layer beside it rather than
 * providing it to it got a dispatcher that refused every browser acquisition —
 * while still claiming `browser` in its transport capabilities.
 */

const browserSource = SourceSpec.make({
  access: "browser_scrape",
  id: "voterrecords",
  transport: "browser",
  url: "https://voterrecords.test/search",
});

const fetchWith = <E>(
  layer: Layer.Layer<SourceTransportService, E>,
  source: SourceSpec
) =>
  Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const transport = yield* SourceTransportService;
        return yield* Effect.result(transport.fetch(source));
      }),
      layer
    )
  );

const fakeEngine = (html: string, seen: string[]): BrowserEngine => ({
  render: (options) =>
    Effect.sync(() => {
      seen.push(options.url);
      return html;
    }),
});

describe("dispatching an acquisition to the transport its spec declares", () => {
  it("refuses a browser source when no engine is wired", async () => {
    const result = await fetchWith(DispatchTransportLayer, browserSource);
    assert.strictEqual(result._tag, "Failure");
    if (result._tag === "Failure") {
      assert.include(result.failure.message, "browser transport");
    }
  });

  /** The case the deployment got wrong: the engine must be *provided* to it. */
  it("uses the browser engine when one is provided to it", async () => {
    const seen: string[] = [];
    const result = await fetchWith(
      Layer.provide(
        DispatchTransportLayer,
        Layer.succeed(
          BrowserEngineService,
          fakeEngine("<html><body>voter record</body></html>", seen)
        )
      ),
      browserSource
    );
    assert.strictEqual(result._tag, "Success");
    assert.deepStrictEqual(seen, [browserSource.url]);
  });

  it("routes an http source to the http transport", async () => {
    const server: Server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end('{"ok":true}');
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    try {
      const { port } = server.address() as AddressInfo;
      const result = await fetchWith(
        DispatchTransportLayer,
        SourceSpec.make({
          id: "api",
          transport: "http",
          url: `http://127.0.0.1:${port}/records`,
        })
      );
      assert.strictEqual(result._tag, "Success");
      if (result._tag === "Success") {
        assert.include(result.success.contentType, "application/json");
      }
    } finally {
      server.close();
    }
  });
});
