import { join } from "node:path";
import type { AcquisitionContext, SourceSpec } from "@viokit/schema";

/**
 * How a browser is launched for one acquisition (TDR-019).
 *
 * Kept as a pure function because every rule worth testing lives here — the
 * proxy switch for a proxied route, its absence for a direct one, a data
 * directory per identity, and the refusal of an engine that cannot be bound to
 * a proxy at all. A browser only has to start for the one opt-in live test.
 */

export type BrowserBackend = "chrome" | "webkit";

export interface BrowserLaunchOptions {
  readonly argv: readonly string[];
  readonly backend: BrowserBackend;
  readonly dataDirectory: string;
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
  /** Where profiles live; one subdirectory per identity. */
  readonly profileRoot: string;
}

export const browserLaunchOptions = (
  source: SourceSpec,
  context: AcquisitionContext | undefined,
  config: BrowserLaunchConfig
): BrowserLaunch => {
  const backend = config.backend ?? "chrome";
  const egress =
    context === undefined ? { path: "live" as const } : context.egress;
  const identity = context?.identity ?? ANONYMOUS_IDENTITY;

  // Proxy binding is a *launch* switch, and a browser process is reused across
  // views: a second acquisition inherits whatever route the first process was
  // started with. Measured — the same proxied acquisition routes correctly in a
  // fresh process and is silently ignored after another acquisition has already
  // started a browser. Until the transport can guarantee a process per route,
  // a proxied browser acquisition cannot be promised, and promising it would
  // mean traffic leaving by the wrong route while the evidence recorded
  // `proxy`. Refuse (I10). See TDR-019's open questions.
  if (egress.path === "proxy") {
    return {
      _tag: "refused",
      refusal: {
        reason:
          "browser acquisition cannot yet honour a proxy egress policy: the proxy is bound when the browser process starts, and processes are reused across acquisitions, so the route cannot be guaranteed per acquisition",
      },
    };
  }

  // Everything below is a direct-egress acquisition: the refusal above is the
  // only path a proxy policy can take. When process-per-route lands, the
  // WebKit backend still cannot honour a proxy at all — it exposes no control
  // for one — so it will need its own refusal here again.

  return {
    _tag: "launch",
    options: {
      argv: [],
      backend,
      // One directory per identity: cookies and storage from one identity must
      // never be presented under another (TDR-011).
      dataDirectory: join(config.profileRoot, identity),
      url: source.url,
    },
  };
};
