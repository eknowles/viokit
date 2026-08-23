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

  // WebKit exposes no proxy control, so a proxied acquisition through it would
  // silently go direct — invisible afterwards, because the evidence would still
  // record `proxy`. Refuse instead (I10).
  if (backend === "webkit" && egress.path === "proxy") {
    return {
      _tag: "refused",
      refusal: {
        reason:
          "the webkit backend cannot be bound to a proxy, and this source's egress policy requires one",
      },
    };
  }

  if (egress.path === "proxy" && egress.viaProxy === undefined) {
    return {
      _tag: "refused",
      refusal: {
        reason: "egress resolved to a proxy but named no proxy to bind to",
      },
    };
  }

  const argv =
    egress.path === "proxy" && egress.viaProxy !== undefined
      ? [`--proxy-server=${egress.viaProxy}`]
      : [];

  return {
    _tag: "launch",
    options: {
      argv,
      backend,
      // One directory per identity: cookies and storage from one identity must
      // never be presented under another (TDR-011).
      dataDirectory: join(config.profileRoot, identity),
      url: source.url,
    },
  };
};
