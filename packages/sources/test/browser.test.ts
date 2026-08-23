import { assert, describe, it } from "@effect/vitest";
import type { AcquisitionContext } from "@viokit/schema";
import { SourceError, SourceSpec } from "@viokit/schema";
import { Effect, Fiber, Latch } from "effect";
import type { BrowserEngine, BrowserRenderOptions } from "../src/browser.js";
import { makeBrowserTransport } from "../src/browser.js";
import type { BrowserRoute } from "../src/browser-launch.js";
import {
  ANONYMOUS_IDENTITY,
  browserLaunchOptions,
} from "../src/browser-launch.js";
import type { BrowserSpawner } from "../src/browser-pool.js";
import { makeBrowserProcessPool, makeRouteGate } from "../src/browser-pool.js";

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
const otherProxy: AcquisitionContext = {
  egress: { path: "proxy", viaProxy: "http://other.test:9090" },
};

const launched = (context: AcquisitionContext | undefined, cfg = config) => {
  const result = browserLaunchOptions(source, context, cfg);
  if (result._tag !== "launch") {
    throw new Error(`expected a launch, got refusal: ${result.refusal.reason}`);
  }
  return result.options;
};

const routeOf = (context: AcquisitionContext | undefined, cfg = config) =>
  launched(context, cfg).route;

describe("the route a browser acquisition belongs to", () => {
  it("adds no proxy switch for a direct route", () => {
    assert.deepStrictEqual(routeOf(direct).argv, []);
  });

  it("carries the resolved proxy as a launch switch", () => {
    assert.deepStrictEqual(routeOf(proxied).argv, [
      "--proxy-server=http://proxy.test:8080",
    ]);
  });

  it("gives each identity its own profile directory (TDR-011)", () => {
    const a = routeOf({ ...direct, identity: "ACLED_KEY" });
    const b = routeOf({ ...direct, identity: "DEHASHED_KEY" });
    assert.notStrictEqual(a.dataDirectory, b.dataDirectory);
    assert.notStrictEqual(a.key, b.key);
    assert.include(a.dataDirectory, "ACLED_KEY");
  });

  it("keeps one identity on one process across acquisitions on one route", () => {
    const first = routeOf({ ...direct, identity: "ACLED_KEY" });
    const second = routeOf({ ...direct, identity: "ACLED_KEY" });
    assert.strictEqual(first.key, second.key);
    assert.strictEqual(first.dataDirectory, second.dataDirectory);
  });

  /**
   * Two Chrome processes cannot share a `--user-data-dir` — the second fails on
   * the profile lock — so the profile is keyed by the pair, not the identity.
   * The consequence is deliberate: a session established through a proxy is not
   * replayed from a different exit.
   */
  it("separates one identity's routes", () => {
    const viaProxy = routeOf({ ...proxied, identity: "ACLED_KEY" });
    const viaDirect = routeOf({ ...direct, identity: "ACLED_KEY" });
    assert.notStrictEqual(viaProxy.key, viaDirect.key);
    assert.notStrictEqual(viaProxy.dataDirectory, viaDirect.dataDirectory);
  });

  it("separates two proxies from each other", () => {
    assert.notStrictEqual(routeOf(proxied).key, routeOf(otherProxy).key);
  });

  it("keeps profile directories free of path-hostile characters", () => {
    assert.notInclude(
      routeOf(proxied).dataDirectory.slice(config.profileRoot.length),
      ":"
    );
  });

  it("shares one profile for sources with no identity", () => {
    assert.include(routeOf(direct).dataDirectory, ANONYMOUS_IDENTITY);
  });

  it("defaults to the chrome backend and carries the source url", () => {
    assert.strictEqual(routeOf(direct).backend, "chrome");
    assert.strictEqual(launched(direct).url, source.url);
  });

  it("treats a missing context as a direct, anonymous acquisition", () => {
    const route = routeOf(undefined);
    assert.deepStrictEqual(route.argv, []);
    assert.include(route.dataDirectory, ANONYMOUS_IDENTITY);
  });
});

describe("an acquisition that cannot honour its route is refused", () => {
  it("refuses a proxied route that names no proxy", () => {
    const result = browserLaunchOptions(
      source,
      { egress: { path: "proxy" } },
      config
    );
    assert.strictEqual(result._tag, "refused");
  });

  /** WebKit exposes no proxy control, so owning its process buys nothing. */
  it("refuses a proxied acquisition on the webkit backend (I10)", () => {
    const result = browserLaunchOptions(source, proxied, {
      ...config,
      backend: "webkit",
    });
    assert.strictEqual(result._tag, "refused");
    if (result._tag === "refused") {
      assert.include(result.refusal.reason, "webkit");
    }
  });

  it("allows webkit for direct work", () => {
    const result = browserLaunchOptions(source, direct, {
      ...config,
      backend: "webkit",
    });
    assert.strictEqual(result._tag, "launch");
  });
});

const fakeSpawner = (spawned: string[], failFor?: string): BrowserSpawner => ({
  spawn: (route) =>
    route.key === failFor
      ? SourceError.make({ message: "browser did not become usable" })
      : Effect.sync(() => {
          spawned.push(route.key);
          return {
            endpoint: `ws://fake/${route.key}`,
            kill: () => spawned.push(`killed:${route.key}`),
          };
        }),
});

describe("the browser process pool", () => {
  it.effect("starts one process per route", () =>
    Effect.gen(function* () {
      const spawned: string[] = [];
      const pool = yield* makeBrowserProcessPool(fakeSpawner(spawned));
      const first = yield* pool.endpointFor(routeOf(direct));
      const second = yield* pool.endpointFor(routeOf(proxied));
      assert.notStrictEqual(first, second);
      assert.strictEqual(spawned.length, 2);
    })
  );

  it.effect("reuses a process when a route is revisited", () =>
    Effect.gen(function* () {
      const spawned: string[] = [];
      const pool = yield* makeBrowserProcessPool(fakeSpawner(spawned));
      const first = yield* pool.endpointFor(routeOf(proxied));
      yield* pool.endpointFor(routeOf(direct));
      const again = yield* pool.endpointFor(routeOf(proxied));
      assert.strictEqual(first, again);
      assert.strictEqual(spawned.length, 2);
    })
  );

  it.effect("fails the acquisition when a browser never becomes usable", () =>
    Effect.gen(function* () {
      const spawned: string[] = [];
      const route = routeOf(direct);
      const pool = yield* makeBrowserProcessPool(
        fakeSpawner(spawned, route.key)
      );
      const result = yield* Effect.result(pool.endpointFor(route));
      assert.strictEqual(result._tag, "Failure");
    })
  );

  it("kills every process it started when its scope closes", async () => {
    const spawned: string[] = [];
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const pool = yield* makeBrowserProcessPool(fakeSpawner(spawned));
          yield* pool.endpointFor(routeOf(direct));
          yield* pool.endpointFor(routeOf(proxied));
        })
      )
    );
    assert.strictEqual(
      spawned.filter((e) => e.startsWith("killed:")).length,
      2
    );
  });
});

describe("the route gate", () => {
  it.effect("does not let two routes run at once", () =>
    Effect.gen(function* () {
      const gate = yield* makeRouteGate;
      const held = yield* Latch.make();
      const events: string[] = [];

      const first = yield* Effect.forkChild(
        gate.withRoute(
          "a",
          Effect.gen(function* () {
            events.push("a:start");
            yield* held.await;
            events.push("a:end");
          })
        )
      );
      yield* Effect.yieldNow;
      const second = yield* Effect.forkChild(
        gate.withRoute(
          "b",
          Effect.sync(() => events.push("b:start"))
        )
      );
      yield* Effect.yieldNow;
      assert.deepStrictEqual(events, ["a:start"]);

      yield* held.open;
      yield* Fiber.join(first);
      yield* Fiber.join(second);
      assert.deepStrictEqual(events, ["a:start", "a:end", "b:start"]);
    })
  );

  it.effect("lets one route run alongside itself", () =>
    Effect.gen(function* () {
      const gate = yield* makeRouteGate;
      const held = yield* Latch.make();
      const events: string[] = [];

      const first = yield* Effect.forkChild(
        gate.withRoute(
          "a",
          Effect.gen(function* () {
            events.push("first");
            yield* held.await;
          })
        )
      );
      yield* Effect.yieldNow;
      // Completes while the first is still holding the route.
      yield* gate.withRoute(
        "a",
        Effect.sync(() => events.push("second"))
      );
      assert.deepStrictEqual(events, ["first", "second"]);

      yield* held.open;
      yield* Fiber.join(first);
    })
  );

  it.effect("gives the route back when an acquisition fails", () =>
    Effect.gen(function* () {
      const gate = yield* makeRouteGate;
      const failed = yield* Effect.result(
        gate.withRoute("a", Effect.fail("refused" as const))
      );
      assert.strictEqual(failed._tag, "Failure");
      // A wedged gate would hang here rather than fail the assertion.
      assert.strictEqual(yield* gate.withRoute("b", Effect.succeed(1)), 1);
    })
  );

  it.effect("gives the route back when an acquisition is interrupted", () =>
    Effect.gen(function* () {
      const gate = yield* makeRouteGate;
      const started = yield* Latch.make();
      const running = yield* Effect.forkChild(
        gate.withRoute(
          "a",
          Effect.gen(function* () {
            yield* started.open;
            yield* Effect.never;
          })
        )
      );
      yield* started.await;
      yield* Fiber.interrupt(running);
      assert.strictEqual(yield* gate.withRoute("b", Effect.succeed(1)), 1);
    })
  );
});

describe("the browser transport", () => {
  const engine = (
    html: string,
    seen: BrowserRenderOptions[]
  ): BrowserEngine => ({
    render: (options) =>
      Effect.sync(() => {
        seen.push(options);
        return html;
      }),
  });

  const pool = {
    endpointFor: (route: BrowserRoute) =>
      Effect.succeed(`ws://fake/${route.key}`),
  };

  const openGate = {
    withRoute: <A, E, R>(_key: string, effect: Effect.Effect<A, E, R>) =>
      effect,
  };

  it("renders a page into evidence bytes", async () => {
    const seen: BrowserRenderOptions[] = [];
    const transport = makeBrowserTransport(
      engine("<html><body>voter record</body></html>", seen),
      pool,
      openGate,
      config
    );
    const result = await Effect.runPromise(transport.fetch(source, direct));
    assert.strictEqual(result.contentType, "text/html");
    assert.include(new TextDecoder().decode(result.bytes), "voter record");
  });

  /** The case that produced the original blanket refusal (TDR-022). */
  it("acquires over a proxy, attached to that route's process", async () => {
    const seen: BrowserRenderOptions[] = [];
    const transport = makeBrowserTransport(
      engine("<html></html>", seen),
      pool,
      openGate,
      config
    );
    await Effect.runPromise(transport.fetch(source, proxied));
    assert.deepStrictEqual(seen.at(0)?.target, {
      _tag: "chrome",
      endpoint: `ws://fake/${routeOf(proxied).key}`,
    });
  });

  it("holds the route for the whole render, not just the attach", async () => {
    const seen: BrowserRenderOptions[] = [];
    const holds: string[] = [];
    const transport = makeBrowserTransport(
      engine("<html></html>", seen),
      pool,
      {
        withRoute: (held, effect) =>
          Effect.gen(function* () {
            holds.push(`enter:${held}`);
            const value = yield* effect;
            holds.push(`leave:${held}`);
            return value;
          }),
      },
      config
    );
    await Effect.runPromise(transport.fetch(source, proxied));
    const { key } = routeOf(proxied);
    assert.deepStrictEqual(holds, [`enter:${key}`, `leave:${key}`]);
  });

  it("fails without rendering when the route cannot be honoured", async () => {
    const seen: BrowserRenderOptions[] = [];
    const transport = makeBrowserTransport(
      engine("<html></html>", seen),
      pool,
      openGate,
      { ...config, backend: "webkit" }
    );
    const result = await Effect.runPromise(
      Effect.result(transport.fetch(source, proxied))
    );
    assert.strictEqual(result._tag, "Failure");
    if (result._tag === "Failure") {
      assert.instanceOf(result.failure, SourceError);
    }
    // Refusing means no traffic by any route.
    assert.deepStrictEqual(seen, []);
  });
});
