import type { EgressDecision, EgressPolicy, SourceAuth } from "@viokit/schema";
import { EgressDisabledError } from "@viokit/schema";
import type { Option } from "effect";
import { Context, Effect, Layer } from "effect";

/**
 * `EgressDecision` now lives in the shared seams (`@viokit/schema`) so a
 * transport can be told the route it must use (I10). `path` maps to the
 * evidence `acquisitionPath` mode (`live`/`proxy`); `viaProxy` records the
 * specific hop per TDR-011.
 */

/** The `Egress` seam (TDR-011): resolve a per-source policy to a decision. */
export interface Egress {
  readonly resolve: (
    policy: EgressPolicy,
    identity?: Option.Option<SourceAuth>
  ) => Effect.Effect<EgressDecision, EgressDisabledError>;
}

/**
 * In-memory egress resolver (task 3.1/3.2/3.3): maps `direct` → live,
 * `proxy` → proxied (with the proxy id), and `disabled` → a typed error.
 *
 * Identity↔egress binding (task 3.4): when a source carries an identity
 * (credential), that identity is bound to the source's resolved egress path —
 * a credential is always presented over the same `direct`/`proxy` route, so
 * upstream services see a coherent identity per TDR-011. The in-memory resolver
 * honors the source policy uniformly regardless of the credential, keeping the
 * binding consistent (no per-request path drift).
 */
export class EgressService extends Context.Service<EgressService, Egress>()(
  "EgressService",
  {
    make: Effect.sync(
      (): Egress => ({
        resolve: (policy) =>
          Effect.gen(function* () {
            switch (policy._tag) {
              case "direct": {
                return { path: "live" };
              }
              case "proxy": {
                return { path: "proxy", viaProxy: policy.proxyId };
              }
              case "disabled": {
                return yield* EgressDisabledError.make({
                  message: "egress is disabled for this source",
                });
              }
              default: {
                return yield* EgressDisabledError.make({
                  message: "unknown egress policy",
                });
              }
            }
          }),
      })
    ),
  }
) {}

export const EgressLayer = Layer.effect(EgressService, EgressService.make);
