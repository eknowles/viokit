import { assert, describe, it } from "@effect/vitest";
import type { AcquisitionContext } from "@viokit/schema";
import { SourceError, SourceSpec } from "@viokit/schema";
import { Effect } from "effect";
import type { BrowserEngine } from "../src/browser.js";
import { makeBrowserTransport } from "../src/browser.js";
import {
  ANONYMOUS_IDENTITY,
  browserLaunchOptions,
} from "../src/browser-launch.js";

const config = { profileRoot: "/profiles" };

const source = SourceSpec.make({
  access: "browser_scrape",
  id: "voterrecords",
  transport: "browser",
  url: "https://voterrecords.test/search",
});

const direct: AcquisitionContext = { egress: { path: "live" } };
const proxied: AcquisitionContext = {
  egress: { path: "proxy", viaProxy: "http://proxy.test:8080" },
};

const launched = (context: AcquisitionContext | undefined, cfg = config) => {
  const result = browserLaunchOptions(source, context, cfg);
  if (result._tag !== "launch") {
    throw new Error(`expected a launch, got refusal: ${result.refusal.reason}`);
  }
  return result.options;
};

describe("browser launch is derived from the runtime's decision", () => {
  it("binds a proxied acquisition to that proxy (I10)", () => {
    assert.deepStrictEqual(launched(proxied).argv, [
      "--proxy-server=http://proxy.test:8080",
    ]);
  });

  it("adds no proxy switch for a direct route", () => {
    assert.deepStrictEqual(launched(direct).argv, []);
  });

  it("gives each identity its own profile directory (TDR-011)", () => {
    const a = launched({ ...direct, identity: "ACLED_KEY" });
    const b = launched({ ...direct, identity: "DEHASHED_KEY" });
    assert.notStrictEqual(a.dataDirectory, b.dataDirectory);
    assert.include(a.dataDirectory, "ACLED_KEY");
  });

  it("keeps one identity on one profile across acquisitions", () => {
    const first = launched({ ...direct, identity: "ACLED_KEY" });
    const second = launched({ ...direct, identity: "ACLED_KEY" });
    assert.strictEqual(first.dataDirectory, second.dataDirectory);
  });

  it("shares one profile for sources with no identity", () => {
    assert.include(launched(direct).dataDirectory, ANONYMOUS_IDENTITY);
  });

  it("defaults to the chrome backend and carries the source url", () => {
    const options = launched(direct);
    assert.strictEqual(options.backend, "chrome");
    assert.strictEqual(options.url, source.url);
  });

  it("treats a missing context as a direct, anonymous acquisition", () => {
    const options = launched(undefined);
    assert.deepStrictEqual(options.argv, []);
    assert.include(options.dataDirectory, ANONYMOUS_IDENTITY);
  });
});

describe("an acquisition that cannot honour its route is refused", () => {
  it("refuses webkit under a proxy policy rather than going direct (I10)", () => {
    const result = browserLaunchOptions(source, proxied, {
      ...config,
      backend: "webkit",
    });
    assert.strictEqual(result._tag, "refused");
    if (result._tag === "refused") {
      assert.include(result.refusal.reason, "webkit");
      assert.include(result.refusal.reason, "proxy");
    }
  });

  it("allows webkit for direct work", () => {
    const result = browserLaunchOptions(source, direct, {
      ...config,
      backend: "webkit",
    });
    assert.strictEqual(result._tag, "launch");
  });

  it("refuses a proxied route that names no proxy", () => {
    const result = browserLaunchOptions(
      source,
      { egress: { path: "proxy" } },
      config
    );
    assert.strictEqual(result._tag, "refused");
  });
});

describe("the browser transport", () => {
  const engine = (html: string, seen: unknown[]): BrowserEngine => ({
    render: (options) =>
      Effect.sync(() => {
        seen.push(options);
        return html;
      }),
  });

  it("renders a page into evidence bytes", async () => {
    const seen: unknown[] = [];
    const transport = makeBrowserTransport(
      engine("<html><body>voter record</body></html>", seen),
      config
    );
    const result = await Effect.runPromise(transport.fetch(source, direct));
    assert.strictEqual(result.contentType, "text/html");
    assert.include(new TextDecoder().decode(result.bytes), "voter record");
  });

  it("hands the engine the launch options the route implies", async () => {
    const seen: { argv: readonly string[] }[] = [];
    const transport = makeBrowserTransport(
      engine("<html></html>", seen as unknown[]),
      config
    );
    await Effect.runPromise(transport.fetch(source, proxied));
    assert.deepStrictEqual(seen[0]?.argv, [
      "--proxy-server=http://proxy.test:8080",
    ]);
  });

  it("fails without rendering when the route cannot be honoured", async () => {
    const seen: unknown[] = [];
    const transport = makeBrowserTransport(engine("<html></html>", seen), {
      ...config,
      backend: "webkit",
    });
    const result = await Effect.runPromise(
      Effect.result(transport.fetch(source, proxied))
    );
    assert.strictEqual(result._tag, "Failure");
    if (result._tag === "Failure") {
      assert.instanceOf(result.failure, SourceError);
    }
    // Nothing was rendered: refusing means no traffic by any route.
    assert.deepStrictEqual(seen, []);
  });
});
