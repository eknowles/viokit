import { describe, expect, it } from "bun:test";
import { SourceSpec } from "@viokit/schema";
import { Effect } from "effect";
import { BunWebViewEngine, makeBrowserTransport } from "../src/browser.js";
import {
  BunBrowserSpawner,
  makeBrowserProcessPool,
  makeRouteGate,
} from "../src/browser-pool.js";

/**
 * Launches real browsers, so it runs under Bun rather than vitest — `Bun.WebView`
 * and `Bun.listen` do not exist in a Node test runner. Deliberately outside the
 * `*.test.ts` pattern so the default suite stays hermetic and does not require
 * Chrome:
 *
 *     bun test ./packages/sources/test/browser-live.ts
 *
 * These are the end-to-end proofs the route-derivation tests cannot give: that a
 * proxied acquisition really is routed through its proxy (I10), and that a
 * second acquisition on a different route gets *its* proxy rather than
 * inheriting the first one's — the failure that produced the original blanket
 * refusal (TDR-022).
 */

const profileRoot = "/tmp/viokit-browser-live";

const spec = (id: string, url: string) =>
  SourceSpec.make({ access: "browser_scrape", id, transport: "browser", url });

const html = (body: string) =>
  new Response(`<html><body>${body}</body></html>`, {
    headers: { "content-type": "text/html" },
  });

/**
 * A forward proxy that answers every absolute-form request with a page naming
 * itself. Paired with a `.invalid` target below, this is what makes a bypass
 * _fail_ instead of quietly succeeding: asserting that a proxy switch was
 * passed is exactly what missed the process-reuse bug the first time.
 */
const namedProxy = (label: string) => {
  const server = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data(socket) {
        const body = `<html><body><h1>via ${label}</h1></body></html>`;
        socket.write(
          `HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n${body}`
        );
        socket.end();
      },
    },
  });
  return {
    port: server.port,
    stop: () => server.stop(true),
    url: `http://127.0.0.1:${server.port}`,
  };
};

/** A host that cannot resolve, so only the proxy can answer for it. */
const PROXY_ONLY = "http://proxy-only.invalid/page";

const withTransport = <A>(
  use: (transport: ReturnType<typeof makeBrowserTransport>) => Promise<A>
): Promise<A> =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const pool = yield* makeBrowserProcessPool(BunBrowserSpawner);
        const gate = yield* makeRouteGate;
        const transport = makeBrowserTransport(BunWebViewEngine, pool, gate, {
          profileRoot,
        });
        return yield* Effect.promise(() => use(transport));
      })
    )
  );

describe("browser transport against a real browser", () => {
  it("renders a page into evidence", async () => {
    const server = Bun.serve({
      fetch: () => html("<h1>live page</h1>"),
      port: 0,
    });
    try {
      const text = await withTransport(async (transport) => {
        const result = await Effect.runPromise(
          transport.fetch(
            spec("live", `http://127.0.0.1:${server.port}/page`),
            {
              egress: { path: "live" },
            }
          )
        );
        return new TextDecoder().decode(result.bytes);
      });
      expect(text).toContain("live page");
    } finally {
      server.stop(true);
    }
  }, 60_000);

  it("routes a proxied acquisition through its proxy (I10)", async () => {
    const proxy = namedProxy("A");
    try {
      const text = await withTransport(async (transport) => {
        const result = await Effect.runPromise(
          transport.fetch(spec("proxied", PROXY_ONLY), {
            egress: { path: "proxy", viaProxy: proxy.url },
          })
        );
        return new TextDecoder().decode(result.bytes);
      });
      expect(text).toContain("via A");
    } finally {
      proxy.stop();
    }
  }, 60_000);

  /**
   * The regression that produced the blanket refusal: with one shared browser
   * process, this second acquisition rendered the *first* proxy's page and the
   * second proxy saw no traffic at all.
   */
  it("does not give a later acquisition the earlier one's route", async () => {
    const first = namedProxy("A");
    const second = namedProxy("B");
    try {
      const [a, b] = await withTransport(async (transport) => {
        const fetchVia = async (id: string, proxy: string) => {
          const result = await Effect.runPromise(
            transport.fetch(spec(id, PROXY_ONLY), {
              egress: { path: "proxy", viaProxy: proxy },
            })
          );
          return new TextDecoder().decode(result.bytes);
        };
        return [
          await fetchVia("first", first.url),
          await fetchVia("second", second.url),
        ];
      });
      expect(a).toContain("via A");
      expect(b).toContain("via B");
    } finally {
      first.stop();
      second.stop();
    }
  }, 120_000);
});
