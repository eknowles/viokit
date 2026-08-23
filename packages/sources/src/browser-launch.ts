import { join } from "node:path";
import type { AcquisitionContext, SourceSpec } from "@viokit/schema";

/**
 * Which browser process an acquisition belongs to, and what to open in it
 * (TDR-019, TDR-022).
 *
 * Kept as a pure function because every rule worth testing lives here — the
 * proxy switch for a proxied route, its absence for a direct one, the key and
 * profile that bind a process to one `(identity, route)` pair, and the refusals
 * that survive. A browser only has to start for the opt-in live test.
 */

export type BrowserBackend = "chrome" | "webkit";

/**
 * A browser process bound to one `(identity, egress route)` pair.
 *
 * `key` identifies the process in the pool; `argv` and `dataDirectory` are what
 * it must be started with. The route is a property of the process rather than a
 * request made of it, which is the whole point: proxy binding is a launch
 * switch, so a process started for one route cannot serve another (TDR-022).
 */
export interface BrowserRoute {
  readonly argv: readonly string[];
  readonly backend: BrowserBackend;
  readonly dataDirectory: string;
  readonly key: string;
}

export interface BrowserLaunchOptions {
  readonly route: BrowserRoute;
  readonly url: string;
}

/** Why a browser acquisition cannot be performed as policy requires. */
export interface BrowserLaunchRefusal {
  readonly reason: string;
}

export type BrowserLaunch =
  | { readonly _tag: "launch"; readonly options: BrowserLaunchOptions }
  | { readonly _tag: "refused"; readonly refusal: BrowserLaunchRefusal };

/** Sources with no credential share one profile; giving each its own would
 * defeat session reuse for no benefit. */
export const ANONYMOUS_IDENTITY = "anonymous";

export interface BrowserLaunchConfig {
  /** Which engine to drive. WebKit cannot be bound to a proxy (TDR-019). */
  readonly backend?: BrowserBackend;
  /** Where profiles live; one subdirectory per `(identity, route)`. */
  readonly profileRoot: string;
}

/** A route's name, safe to use as a path segment and stable across runs. */
const routeSegment = (viaProxy: string | undefined): string =>
  viaProxy === undefined
    ? "direct"
    : `proxy-${viaProxy.replaceAll(/[^\w.-]/g, "_")}`;

const refuse = (reason: string): BrowserLaunch => ({
  _tag: "refused",
  refusal: { reason },
});

export const browserLaunchOptions = (
  source: SourceSpec,
  context: AcquisitionContext | undefined,
  config: BrowserLaunchConfig
): BrowserLaunch => {
  const backend = config.backend ?? "chrome";
  const egress =
    context === undefined ? { path: "live" as const } : context.egress;
  const identity = context?.identity ?? ANONYMOUS_IDENTITY;
  const proxied = egress.path === "proxy";

  if (proxied && egress.viaProxy === undefined) {
    // A route we cannot name is a route we cannot bind, and guessing would put
    // traffic somewhere policy did not choose (I10).
    return refuse(
      "egress policy requires a proxy but names none, so no browser process can be bound to it"
    );
  }
  if (proxied && backend === "webkit") {
    // WebKit exposes no proxy control at all, so owning its process buys
    // nothing — it would still leave by whatever route the host has (TDR-019).
    return refuse(
      "the webkit backend exposes no proxy control, so a proxied acquisition cannot be bound to its route"
    );
  }

  const segment = routeSegment(proxied ? egress.viaProxy : undefined);

  return {
    _tag: "launch",
    options: {
      route: {
        argv: proxied ? [`--proxy-server=${egress.viaProxy}`] : [],
        backend,
        // One directory per (identity, route). Per identity because cookies
        // from one identity must never be presented under another (TDR-011);
        // per route because two Chrome processes cannot share a profile — the
        // second fails on its lock — and because a session established through
        // a proxy should not be replayed from a different exit.
        dataDirectory: join(config.profileRoot, identity, segment),
        key: `${identity}|${segment}`,
      },
      url: source.url,
    },
  };
};
