import { Context } from "effect";
import type { SourceSpec, Transport } from "./schemas.js";

/**
 * Whether this deployment can actually acquire a source, and if not, why.
 *
 * Derived, never stored: the same `SourceSpec` is runnable in a deployment with
 * a browser sidecar and not in one without, and a credential-gated source
 * becomes runnable the moment its spec carries auth. A stored flag would be a
 * lie as soon as the spec moved between deployments. The catalog and the source
 * runtime both call this, so what the catalog advertises is what acquisition
 * does.
 */
export interface Runnability {
  readonly reason?: string;
  readonly runnable: boolean;
}

/** Transport kinds a deployment provides. Includes kinds no `Transport` value
 * names yet (`browser`), so declaring one later is wiring, not a code change. */
export type TransportKind = Transport | "browser";

/**
 * The transports this deployment provides. Nothing else states this — there is
 * one `SourceTransportService` and no way to ask what it covers — and the
 * refusal reason has to be true, not assumed.
 */
export class TransportCapabilities extends Context.Service<
  TransportCapabilities,
  readonly TransportKind[]
>()("TransportCapabilities") {}

/** What the standard transport layers provide today. */
export const defaultTransportCapabilities: readonly TransportKind[] = [
  "http",
  "dataset",
];

const runnable: Runnability = { runnable: true };

/**
 * Whether a credential reference resolves in this deployment. Supplied by the
 * caller, because resolution is environment-dependent while everything else
 * here is a property of the spec. Defaults to "nothing resolves", so a caller
 * that has not wired a provider under-promises rather than claiming a source
 * works when its key is absent.
 */
export type SecretResolves = (secretRef: string) => boolean;

export const runnabilityOf = (
  source: SourceSpec,
  capabilities: readonly TransportKind[] = defaultTransportCapabilities,
  secretResolves: SecretResolves = () => false
): Runnability => {
  if (source.access === "browser_scrape" && !capabilities.includes("browser")) {
    return {
      reason:
        "source is a browser-only interface and this deployment provides no browser transport",
      runnable: false,
    };
  }
  if (source.auth !== undefined && !secretResolves(source.auth.secretRef)) {
    return {
      reason: `credential '${source.auth.secretRef}' does not resolve in this deployment`,
      runnable: false,
    };
  }
  if (source.access === "requires_key" && source.auth === undefined) {
    return {
      reason: "source requires credentials and none are declared on its spec",
      runnable: false,
    };
  }
  if (!capabilities.includes(source.transport)) {
    return {
      reason: `source declares transport '${source.transport}', which this deployment does not provide`,
      runnable: false,
    };
  }
  // `unknown` is attempted, not refused: that is missing metadata, not a known
  // constraint, and the harness records it freely.
  return runnable;
};
