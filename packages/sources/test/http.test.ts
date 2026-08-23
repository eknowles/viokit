import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { assert, describe, it } from "@effect/vitest";
import type { TransportResult } from "@viokit/schema";
import { SourceSpec, SourceTransportService } from "@viokit/schema";
import { Effect } from "effect";
import { HttpTransportLayer } from "../src/http.js";

/**
 * Served against a real server rather than a fake transport: what is being
 * asserted here is what the transport does with a *response*, and a fake stands
 * in for the transport itself. The previous fake made these properties
 * unobservable, which is how the content type went unnoticed as a constant.
 */
const served = (
  handler: (
    respond: (
      status: number,
      headers: Record<string, string>,
      body: string
    ) => void
  ) => void
): Promise<{ readonly close: () => void; readonly url: string }> =>
  new Promise((resolve) => {
    const server: Server = createServer((_request, response) => {
      handler((status, headers, body) => {
        response.writeHead(status, headers);
        response.end(body);
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        close: () => server.close(),
        url: `http://127.0.0.1:${port}/artefact`,
      });
    });
  });

const fetchFrom = (url: string): Promise<TransportResult> =>
  Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const transport = yield* SourceTransportService;
        return yield* transport.fetch(
          SourceSpec.make({ id: "s1", transport: "http", url })
        );
      }),
      HttpTransportLayer
    )
  );

describe("http transport", () => {
  it("produces the response bytes", async () => {
    const server = await served((respond) =>
      respond(200, { "content-type": "text/plain" }, "abc")
    );
    try {
      const result = await fetchFrom(server.url);
      assert.strictEqual(new TextDecoder().decode(result.bytes), "abc");
    } finally {
      server.close();
    }
  });

  it("records the content type the source served", async () => {
    const server = await served((respond) =>
      respond(200, { "content-type": "application/json" }, '{"ok":true}')
    );
    try {
      const result = await fetchFrom(server.url);
      assert.include(result.contentType, "application/json");
    } finally {
      server.close();
    }
  });

  it("records a page as html, not as unspecified bytes", async () => {
    const server = await served((respond) =>
      respond(200, { "content-type": "text/html; charset=utf-8" }, "<html/>")
    );
    try {
      const result = await fetchFrom(server.url);
      assert.include(result.contentType, "text/html");
    } finally {
      server.close();
    }
  });

  /**
   * Effect's `HttpClient` does not fail on a 4xx, so without the status a
   * credential wall arrives looking exactly like a successful fetch.
   */
  it("surfaces a rejected request's status", async () => {
    const server = await served((respond) =>
      respond(401, { "content-type": "text/html" }, "<html>sign in</html>")
    );
    try {
      const result = await fetchFrom(server.url);
      assert.strictEqual(result.status, 401);
    } finally {
      server.close();
    }
  });
});
