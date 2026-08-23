import { createHash, createPublicKey, sign } from "node:crypto";
import type { SecretProvider } from "@viokit/schema";
import { SecretProviderService } from "@viokit/schema";
import { Context, Effect, Layer, Option } from "effect";

/**
 * Signing an evidentiary bundle (TDR-026).
 *
 * Ed25519 from the standard library: no dependency, and no parameters to choose
 * — which is the way schemes like ECDSA get implemented wrongly. A recipient
 * verifies with stock `openssl` and none of our software, which was measured
 * before this was chosen, because a signature only we can check would be a
 * downgrade dressed as an upgrade.
 */

/** Where the private key comes from. A key is a secret, so it is a reference
 * (TDR-018), never a literal that could be written into anything tracked. */
export class SigningKeyRef extends Context.Service<SigningKeyRef, string>()(
  "SigningKeyRef"
) {}

export const SIGNING_KEY_ENV = "VIOKIT_SIGNING_KEY";

export interface SigningKey {
  /** SHA-256 of the public key, so a recipient can compare with a key they
   * already hold rather than trusting the one in the bundle. */
  readonly publicKeyFingerprint: string;
  readonly publicKeyPem: string;
}

export interface BundleSignature extends SigningKey {
  /** Detached, raw Ed25519 — 64 bytes. */
  readonly signature: Uint8Array;
}

export interface BundleSigner {
  /**
   * The key this deployment would sign with, without signing anything.
   *
   * Separate from `sign` because the manifest has to *declare* the fingerprint
   * before the tag manifest that digests the manifest can be signed — and
   * signing a throwaway payload just to discover whether a key exists would be
   * a hack standing in for a question the signer can simply answer.
   */
  readonly publicKey: Effect.Effect<Option.Option<SigningKey>>;
  /** Absent when this deployment has no key: an unsigned bundle must say so
   * rather than being silently unsigned. */
  readonly sign: (
    payload: Uint8Array
  ) => Effect.Effect<Option.Option<BundleSignature>>;
}

export class BundleSignerService extends Context.Service<
  BundleSignerService,
  BundleSigner
>()("BundleSignerService") {}

/** A PKCS#8 PEM private key, as `SecretProvider` resolved it. */
export const signWithPem = (
  pem: string,
  payload: Uint8Array
): BundleSignature => {
  // Ed25519 signs the message directly; there is no digest algorithm to pick.
  const signature = sign(null, payload, pem);
  const publicKeyPem = createPublicKey(pem)
    .export({ format: "pem", type: "spki" })
    .toString();
  return {
    publicKeyFingerprint: createHash("sha256")
      .update(publicKeyPem)
      .digest("hex"),
    publicKeyPem,
    signature: new Uint8Array(signature),
  };
};

export const makeBundleSigner = (
  secrets: SecretProvider | undefined,
  ref: string
): BundleSigner => {
  const pem = Effect.gen(function* () {
    if (secrets === undefined || ref === "") {
      return Option.none<string>();
    }
    return yield* secrets.get(ref);
  });

  return {
    publicKey: Effect.map(pem, (key) =>
      Option.map(key, (value) => {
        const { publicKeyFingerprint, publicKeyPem } = signWithPem(
          value,
          new Uint8Array()
        );
        return { publicKeyFingerprint, publicKeyPem };
      })
    ),
    sign: (payload) =>
      Effect.map(pem, (key) =>
        Option.map(key, (value) => signWithPem(value, payload))
      ),
  };
};

export const BundleSignerLayer: Layer.Layer<BundleSignerService> = Layer.effect(
  BundleSignerService,
  Effect.gen(function* () {
    const secrets = Option.getOrUndefined(
      yield* Effect.serviceOption(SecretProviderService)
    );
    const ref = Option.getOrElse(
      yield* Effect.serviceOption(SigningKeyRef),
      () => process.env[SIGNING_KEY_ENV] ?? ""
    );
    return makeBundleSigner(secrets, ref);
  })
);
