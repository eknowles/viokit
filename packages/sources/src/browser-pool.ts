import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { SourceError } from "@viokit/schema";
import { Context, Effect, Schedule, Semaphore, TxRef } from "effect";
import type { Scope } from "effect/Scope";
import type { BrowserRoute } from "./browser-launch.js";

/**
 * Browser processes, one per `(identity, egress route)`, and the gate that
 * keeps two routes from being open at once (TDR-022).
 *
 * The measured constraint: all simultaneously-open `Bun.WebView`s in one Bun
 * process share a single Chrome connection, so a view opened while another
 * route's view is open silently gets the other route. Owning the processes is
 * what makes the binding a fact rather than a request; the gate is what stops
 * the shared connection from undoing it.
 */

/** A browser process we started and are responsible for. */
export interface SpawnedBrowser {
  /** The DevTools WebSocket a view attaches to. */
  readonly endpoint: string;
  readonly kill: () => void;
}

/**
 * Starts a browser bound to one route. A seam so the pool's keying, reuse, and
 * teardown can be tested without a browser on the host.
 */
export interface BrowserSpawner {
  readonly spawn: (
    route: BrowserRoute
  ) => Effect.Effect<SpawnedBrowser, SourceError>;
}

export class BrowserSpawnerService extends Context.Service<
  BrowserSpawnerService,
  BrowserSpawner
>()("BrowserSpawnerService") {}

export interface BrowserProcessPool {
  readonly endpointFor: (
    route: BrowserRoute
  ) => Effect.Effect<string, SourceError>;
}

export class BrowserProcessPoolService extends Context.Service<
  BrowserProcessPoolService,
  BrowserProcessPool
>()("BrowserProcessPoolService") {}

/**
 * Keeps one warm process per route key. Spawning is serialized so two
 * acquisitions admitted on the same route cannot start two browsers for it —
 * the second would fail on the profile lock anyway.
 */
export const makeBrowserProcessPool = (
  spawner: BrowserSpawner
): Effect.Effect<BrowserProcessPool, never, Scope> =>
  Effect.gen(function* () {
    const processes = new Map<string, SpawnedBrowser>();
    const spawning = yield* Semaphore.make(1);

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        for (const process of processes.values()) {
          process.kill();
        }
        processes.clear();
      })
    );

    return {
      endpointFor: (route) =>
        Semaphore.withPermit(
          spawning,
          Effect.gen(function* () {
            const existing = processes.get(route.key);
            if (existing !== undefined) {
              return existing.endpoint;
            }
            const spawned = yield* spawner.spawn(route);
            processes.set(route.key, spawned);
            return spawned.endpoint;
          })
        ),
    };
  });

/**
 * Admits acquisitions one route at a time, and any number of acquisitions on
 * the route already admitted.
 */
export interface RouteGate {
  readonly withRoute: <A, E, R>(
    key: string,
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>;
}

export class RouteGateService extends Context.Service<
  RouteGateService,
  RouteGate
>()("RouteGateService") {}

interface RouteHold {
  readonly count: number;
  readonly key: string;
}

/**
 * A transactional group lock. Written as a transaction rather than a read
 * followed by a write because the window between the two is exactly where the
 * wrong-route bug would come back; `txRetry` re-runs the decision whenever the
 * hold changes, so a waiter wakes when its route becomes admissible.
 */
export const makeRouteGate: Effect.Effect<RouteGate> = Effect.gen(function* () {
  const hold = yield* TxRef.make<RouteHold | undefined>(undefined);

  const enter = (key: string) =>
    Effect.tx(
      Effect.gen(function* () {
        const current = yield* TxRef.get(hold);
        if (current !== undefined && current.key !== key) {
          return yield* Effect.txRetry;
        }
        yield* TxRef.set(hold, { count: (current?.count ?? 0) + 1, key });
      })
    );

  const leave = Effect.tx(
    TxRef.update(hold, (current) =>
      current === undefined || current.count <= 1
        ? undefined
        : { count: current.count - 1, key: current.key }
    )
  );

  return {
    withRoute: (key, effect) =>
      // `acquireUseRelease` so the hold is given back on failure and on
      // interruption too: one refusal must not wedge every later acquisition.
      Effect.acquireUseRelease(
        enter(key),
        () => effect,
        () => leave
      ),
  };
});

/** Where Chrome is, when we are the ones starting it. */
const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

const chromeExecutable = (): string => {
  const configured = process.env.BUN_CHROME_PATH;
  if (configured !== undefined && configured !== "") {
    return configured;
  }
  const found = chromeCandidates.find((candidate) => existsSync(candidate));
  if (found === undefined) {
    throw new Error(
      "no Chrome executable found; set BUN_CHROME_PATH to the browser this deployment should drive"
    );
  }
  return found;
};

/** How long to wait for a spawned browser to publish its debugging socket. */
const READY_TIMEOUT_MS = 20_000;
const READY_POLL_MS = 50;

const portFileOf = (profileDirectory: string) =>
  join(profileDirectory, "DevToolsActivePort");

const startChrome = (route: BrowserRoute) =>
  Effect.tryPromise({
    catch: (cause) =>
      SourceError.make({
        message: `could not start a browser for this route: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      }),
    try: async () => {
      const executable = chromeExecutable();
      await mkdir(route.dataDirectory, { recursive: true });
      // Chrome removes this on a clean exit but not when it is killed — which
      // is how the pool ends every process it owns. Left in place, readiness
      // succeeds instantly against a socket that died with the last run.
      await rm(portFileOf(route.dataDirectory), { force: true });
      return spawn(
        executable,
        [
          "--headless=new",
          "--remote-debugging-port=0",
          `--user-data-dir=${route.dataDirectory}`,
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-gpu",
          ...route.argv,
        ],
        { stdio: "ignore" }
      );
    },
  });

/**
 * Chrome writes `<port>\n<path>` into its profile directory once the debugging
 * socket is listening. Reading it is a real signal about a real state — waiting
 * a fixed interval instead is what TDR-022 rejected — so this is retried until
 * it succeeds or the deadline passes.
 */
const readDevToolsEndpoint = (profileDirectory: string) =>
  Effect.tryPromise({
    catch: (cause) =>
      SourceError.make({
        message: `browser is not ready yet: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      }),
    try: async () => {
      const text = await readFile(portFileOf(profileDirectory), "utf8");
      const [port, path] = text.split("\n");
      if (port === undefined || path === undefined || path === "") {
        throw new Error("DevToolsActivePort is incomplete");
      }
      return `ws://127.0.0.1:${port.trim()}${path.trim()}`;
    },
  });

/**
 * The real spawner. Starts Chrome bound to the route's proxy and profile, with
 * its own debugging socket, and leaves it running so the next acquisition on
 * that route costs an attach rather than a launch.
 */
export const BunBrowserSpawner: BrowserSpawner = {
  spawn: (route) =>
    Effect.gen(function* () {
      const child = yield* startChrome(route);
      const endpoint = yield* readDevToolsEndpoint(route.dataDirectory).pipe(
        Effect.retry(Schedule.spaced(READY_POLL_MS)),
        Effect.timeout(READY_TIMEOUT_MS),
        Effect.catch(() =>
          Effect.gen(function* () {
            // A browser we cannot drive is a browser we should not leave
            // running: it holds the profile lock the next attempt needs.
            child.kill();
            return yield* SourceError.make({
              message: `browser did not become usable within ${READY_TIMEOUT_MS}ms`,
            });
          })
        )
      );
      return {
        endpoint,
        kill: () => {
          child.kill();
        },
      };
    }),
};
