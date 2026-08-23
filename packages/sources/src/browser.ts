import type { AcquisitionContext, SourceSpec } from "@viokit/schema";
import { SourceError, SourceTransportService } from "@viokit/schema";
import { Context, Effect, Layer, Option } from "effect";
import type {
  BrowserLaunchConfig,
  BrowserLaunchOptions,
} from "./browser-launch.js";
import { browserLaunchOptions } from "./browser-launch.js";

/**
 * The `transport: "browser"` producer (TDR-019): drives headless Chrome through
 * `Bun.WebView`, binding each acquisition to the egress route the runtime
 * resolved and isolating identities by profile directory.
 *
 * The engine sits behind a seam for two reasons: tests should not have to
 * launch a browser to assert launch decisions, and `Bun.WebView` is young
 * enough that two of the four behaviours the TDR-019 spike checked contradicted
 * its documentation — a surface like that is one to keep at arm's length.
 */

export interface BrowserEngine {
  /** Open a page with the given options and return its rendered HTML. */
  readonly render: (
    options: BrowserLaunchOptions
  ) => Effect.Effect<string, SourceError>;
}

export class BrowserEngineService extends Context.Service<
  BrowserEngineService,
  BrowserEngine
>()("BrowserEngineService") {}

/** Where browser profiles live; one subdirectory per identity. */
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

/**
 * The real engine. Requires Bun 1.4 (`Bun.WebView`) and a Chrome-family
 * browser on the host; a deployment lacking either simply does not wire this
 * layer, and browser sources stay reported as blocked.
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
          backend: { argv: [...options.argv], type: options.backend },
          dataStore: { directory: options.dataDirectory },
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
      const html = yield* engine.render(launch.options);
      return {
        bytes: new TextEncoder().encode(html),
        contentType: "text/html",
      };
    }),
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
    return makeBrowserTransport(engine, { profileRoot });
  })
);
