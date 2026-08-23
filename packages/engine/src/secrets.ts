import { readFile } from "node:fs/promises";
import type { SecretProvider } from "@viokit/schema";
import { SecretProviderService } from "@viokit/schema";
import { Effect, Layer, Option } from "effect";

/**
 * Credential resolution (TDR-018). References are named here; values live in
 * the environment or a gitignored file, never in a `SourceSpec` — packs are
 * tracked source, so a spec that could carry a secret eventually would.
 *
 * Only the runtime holds a provider. Transports receive an already-resolved
 * credential, so a pack-contributed transport cannot reach arbitrary secrets
 * (I4/I10).
 */

/** An exported-but-empty variable is the usual way a credential is "set" but
 * unusable; treating it as present would make runnability lie. */
const present = (value: string | undefined): Option.Option<string> =>
  value === undefined || value.trim() === ""
    ? Option.none()
    : Option.some(value);

export const makeEnvSecretProvider = (
  env: Record<string, string | undefined>
): SecretProvider => ({
  get: (secretRef) => Effect.sync(() => present(env[secretRef])),
});

/** The default: environment variables. */
export const SecretProviderEnvLayer: Layer.Layer<SecretProviderService> =
  Layer.sync(SecretProviderService, () => makeEnvSecretProvider(process.env));

/** No secrets at all — credential-gated sources report as blocked. */
export const SecretProviderEmptyLayer: Layer.Layer<SecretProviderService> =
  Layer.succeed(SecretProviderService, {
    get: () => Effect.succeed(Option.none()),
  });

/**
 * A JSON object of reference → value, read once. Intended for a gitignored
 * path under `.viokit/`; a missing or unreadable file resolves nothing rather
 * than failing the layer, so a deployment without one still starts.
 */
export const makeFileSecretProvider = (
  path: string
): Effect.Effect<SecretProvider> =>
  Effect.map(
    Effect.orElseSucceed(
      Effect.tryPromise(() => readFile(path, "utf8")),
      () => "{}"
    ),
    (contents) => {
      let values: Record<string, string | undefined> = {};
      try {
        const parsed: unknown = JSON.parse(contents);
        if (typeof parsed === "object" && parsed !== null) {
          values = parsed as Record<string, string | undefined>;
        }
      } catch {
        values = {};
      }
      return {
        get: (secretRef) => Effect.sync(() => present(values[secretRef])),
      };
    }
  );

export const makeFileSecretProviderLayer = (
  path: string
): Layer.Layer<SecretProviderService> =>
  Layer.effect(SecretProviderService, makeFileSecretProvider(path));
