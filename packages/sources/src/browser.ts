import type { AcquisitionContext, SourceSpec } from "@viokit/schema";
import { SourceError, SourceTransportService } from "@viokit/schema";
import { Context, Effect, Layer, Option } from "effect";
import type { BrowserLaunchConfig } from "./browser-launch.js";
import { browserLaunchOptions } from "./browser-launch.js";
import type { BrowserProcessPool, RouteGate } from "./browser-pool.js";
import {
  BunBrowserSpawner,
  makeBrowserProcessPool,
  makeRouteGate,
} from "./browser-pool.js";

/**
 * The `transport: "browser"` producer (TDR-019, TDR-022): drives headless
 * Chrome through `Bun.WebView`, attaching each acquisition to the process
 * Viokit started for the egress route the runtime resolved.
 *
 * The engine sits behind a seam for two reasons: tests should not have to
 * launch a browser to assert routing decisions, and `Bun.WebView` is young
 * enough that several of the behaviours the TDR-019 and TDR-022 spikes checked
 * contradicted its documentation — a surface like that is one to keep at arm's
 * length.
 */

/**
 * Where a view attaches. A Chrome we own is named by its DevTools endpoint, so
 * the engine has no way to reach a differently-routed process; the WebKit host
 * has no such handle and is direct-only, which is the only reason it can be
 * left for Bun to start.
 */
export type BrowserTarget =
  | { readonly _tag: "chrome"; readonly endpoint: string }
  | { readonly _tag: "webkit" };

export interface BrowserRenderOptions {
  readonly target: BrowserTarget;
  readonly url: string;
}

export interface BrowserEngine {
  /** Open a page in the given browser and return its rendered HTML. */
  readonly render: (
    options: BrowserRenderOptions
  ) => Effect.Effect<string, SourceError>;
}

export class BrowserEngineService extends Context.Service<
  BrowserEngineService,
  BrowserEngine
>()("BrowserEngineService") {}

/** Where browser profiles live; one subdirectory per (identity, route). */
export class BrowserProfileRoot extends Context.Service<
  BrowserProfileRoot,
  string
>()("BrowserProfileRoot") {}

export const defaultBrowserProfileRoot = "./.viokit/browser-profiles";

interface WebViewLike {
  readonly close?: () => void;
  readonly evaluate: (script: string) => Promise<unknown>;
  readonly navigate: (url: string) => Promise<unknown>;
}

type WebViewConstructor = new (options: Record<string, unknown>) => WebViewLike;

const webViewConstructor = (): WebViewConstructor | undefined =>
  (globalThis as { Bun?: { WebView?: WebViewConstructor } }).Bun?.WebView;

const backendFor = (target: BrowserTarget): Record<string, unknown> =>
  target._tag === "webkit"
    ? { type: "webkit" }
    : { type: "chrome", url: target.endpoint };

/**
 * The real engine. Requires Bun 1.4 (`Bun.WebView`) and, for chrome targets, a
 * process the pool already started; a deployment lacking either simply does not
 * wire this layer, and browser sources stay reported as blocked.
 */
export const BunWebViewEngine: BrowserEngine = {
  render: (options) =>
    Effect.tryPromise({
      catch: (cause) =>
        SourceError.make({
          message: `browser acquisition failed: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
        }),
      try: async () => {
        const WebView = webViewConstructor();
        if (WebView === undefined) {
          throw new Error(
            "Bun.WebView is unavailable — the browser transport needs Bun 1.4 or later"
          );
        }
        const view = new WebView({
          backend: backendFor(options.target),
          headless: true,
        });
        try {
          await view.navigate(options.url);
          const html = await view.evaluate(
            "document.documentElement.outerHTML"
          );
          return typeof html === "string" ? html : "";
        } finally {
          view.close?.();
        }
      },
    }),
};

export const BunWebViewEngineLayer: Layer.Layer<BrowserEngineService> =
  Layer.succeed(BrowserEngineService, BunWebViewEngine);

export const makeBrowserTransport = (
  engine: BrowserEngine,
  pool: BrowserProcessPool,
  gate: RouteGate,
  config: BrowserLaunchConfig
) => ({
  fetch: (source: SourceSpec, context?: AcquisitionContext) =>
    Effect.gen(function* () {
      const launch = browserLaunchOptions(source, context, config);
      if (launch._tag === "refused") {
        // Failing is the point: proceeding by another route would satisfy the
        // caller while bypassing the policy, and the evidence would not show it.
        return yield* SourceError.make({
          message: `cannot acquire '${source.id}' by browser: ${launch.refusal.reason}`,
        });
      }
      const { route, url } = launch.options;

      // The hold spans the whole render, not just the attach: the hazard is a
      // view *open* on another route, since every open view in this process
      // shares one browser connection (TDR-022).
      return yield* gate.withRoute(
        route.key,
        Effect.gen(function* () {
          const target: BrowserTarget =
            route.backend === "webkit"
              ? { _tag: "webkit" }
              : {
                  _tag: "chrome",
                  endpoint: yield* pool.endpointFor(route),
                };
          const html = yield* engine.render({ target, url });
          return {
            bytes: new TextEncoder().encode(html),
            contentType: "text/html",
          };
        })
      );
    }),
});

/**
 * Builds the transport's stateful half — the process pool and the route gate.
 * Both are per-deployment, so they are constructed once wherever a browser
 * engine is present rather than per acquisition.
 */
export const makeBrowserRuntime = Effect.gen(function* () {
  const pool = yield* makeBrowserProcessPool(BunBrowserSpawner);
  const gate = yield* makeRouteGate;
  return { gate, pool };
});

export const BrowserTransportLayer: Layer.Layer<
  SourceTransportService,
  never,
  BrowserEngineService
> = Layer.effect(
  SourceTransportService,
  Effect.gen(function* () {
    const engine = yield* BrowserEngineService;
    const profileRoot = Option.getOrElse(
      yield* Effect.serviceOption(BrowserProfileRoot),
      () => defaultBrowserProfileRoot
    );
    const { gate, pool } = yield* makeBrowserRuntime;
    return makeBrowserTransport(engine, pool, gate, { profileRoot });
  })
);
