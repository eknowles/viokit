import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Evidence,
  EvidenceId,
  GraphState,
  Redaction,
  Step,
} from "@viokit/schema";
import { EvidenceReadError } from "@viokit/schema";
import { Effect, Option, Schema } from "effect";
import type { BundleSigner, SigningKey } from "./signing.js";

/**
 * Evidentiary export (TDR-010): a BagIt-shaped bundle a recipient can verify
 * and rebuild without running this system.
 *
 * `manifest-sha256.txt` and `bagit.txt` are BagIt's, and their value is that
 * they are *not ours* — any BagIt tool verifies them. `viokit-manifest.json`
 * carries the meaning BagIt has no vocabulary for: the graph, the step log, and
 * what produced each step.
 */

/** Two lines, per RFC 8493. */
const BAGIT_DECLARATION =
  "BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n";

/**
 * Stated in the bundle rather than only in documentation, because a bundle
 * travels away from its documentation and has to carry its own claims.
 *
 * Since TDR-021 an artifact's identifier *is* its SHA-256 digest, so verifying
 * the digest also confirms the artifact is the one the steps reference — one
 * check, not two. What remains outside the bundle's reach is custody before
 * export, and it says so.
 */
const INTEGRITY_NOTE =
  "Each artifact's evidenceId IS the SHA-256 digest of its bytes, and manifest-sha256.txt records the same digest in BagIt form. tagmanifest-sha256.txt digests the tag files, so the trail — steps, custody, and what was withheld — is covered too: `shasum -a 256 -c manifest-sha256.txt && shasum -a 256 -c tagmanifest-sha256.txt`. Where this bundle is signed, the signature is over tagmanifest-sha256.txt and therefore covers everything transitively; see the `signing` block for how to check it. Where an artifact records `acquiredBy`, that is the principal this deployment authenticated as obtaining it — attested by the signature as this deployment's claim, not proof of custody at the moment of acquisition.";

export interface ExportedEvidence {
  readonly acquiredAt: string;
  /** Who obtained it, where the deployment could say (TDR-023). */
  readonly acquiredBy?: string;
  readonly acquisitionPath: unknown;
  readonly byteLength: number;
  readonly contentType: string;
  readonly evidenceId: string;
  readonly file: string;
  readonly sha256: string;
}

/** An artifact deliberately kept out of the bundle (TDR-024). */
export interface WithheldEvidence {
  readonly evidenceId: string;
  readonly ground: string;
  readonly reason: string;
  readonly redactedAt: string;
  readonly redactedBy: string;
}

/** How, and whether, this bundle is signed (TDR-026). */
export interface BundleSigning {
  readonly algorithm: "ed25519";
  /** Stated plainly, because a bundle carrying its own key proves internal
   * consistency and not authenticity. */
  readonly note: string;
  /** SHA-256 of the public key, so a recipient can compare it with a key they
   * already hold rather than trusting the one that travelled with the bundle. */
  readonly publicKeyFingerprint?: string;
  readonly signed: boolean;
  /** What a recipient runs. Stock openssl; none of our software. */
  readonly verify: string;
}

export interface BundleManifest {
  readonly evidence: readonly ExportedEvidence[];
  readonly exportedAt: string;
  readonly graph: unknown;
  readonly integrity: string;
  /** Artifacts a step references that the store could not produce. */
  readonly missingEvidence: readonly string[];
  /** Whether the trail below is signed, and how to check it. */
  readonly signing: BundleSigning;
  readonly steps: readonly unknown[];
  /**
   * What this bundle is deliberately not carrying, and why.
   *
   * Named rather than silently omitted: a bundle that contains less than the
   * case does, without saying so, is a misleading document — and this format
   * exists to be trusted (TDR-024).
   */
  readonly withheld: readonly WithheldEvidence[];
}

export interface Bundle {
  readonly manifest: BundleManifest;
  readonly path: string;
}

/**
 * `node:crypto` rather than `Bun.CryptoHasher`: the engine is a library, and
 * TDR-001 keeps Node a drop-in target, so it must not depend on a Bun global.
 */
/** Recomputed from the bytes read back rather than trusted from metadata: a
 * digest taken from what we believe would attest to nothing. Since TDR-021 it
 * must equal the artifact's id, which the tests assert. */
const encodeUtf8 = (value: string): Uint8Array =>
  new TextEncoder().encode(value);

const VERIFY_COMMAND =
  "openssl pkeyutl -verify -pubin -inkey signing-key.pub.pem -rawin -in tagmanifest-sha256.txt -sigfile tagmanifest-sha256.txt.sig";

const UNSIGNED_NOTE =
  "This bundle is NOT signed: the deployment that exported it held no signing key. Its digests still show the artifacts and the trail are internally consistent, but nothing attributes them to anyone.";

const SIGNED_NOTE =
  "The signature covers tagmanifest-sha256.txt, which digests bagit.txt, manifest-sha256.txt and viokit-manifest.json — so it covers the artifacts and the trail transitively. The public key travels here for convenience only: verifying against it proves the bundle is internally consistent, not who produced it. Compare publicKeyFingerprint against a key you obtained separately.";

/**
 * Sign if this deployment can, and declare the outcome either way. A recipient
 * assuming a signature that is absent is worse than an unsigned bundle plainly
 * labelled, so the manifest always says which it is.
 */
const signingFor = (input: ExportInput) =>
  Effect.gen(function* () {
    const key =
      input.signer === undefined
        ? Option.none<SigningKey>()
        : yield* input.signer.publicKey;
    const signed = Option.isSome(key);
    return {
      algorithm: "ed25519" as const,
      note: signed ? SIGNED_NOTE : UNSIGNED_NOTE,
      ...(signed
        ? { publicKeyFingerprint: key.value.publicKeyFingerprint }
        : {}),
      signed,
      verify: signed ? VERIFY_COMMAND : "n/a — this bundle is unsigned",
    };
  });

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

export interface ExportInput {
  readonly at: Date;
  readonly evidence: (
    id: EvidenceId
  ) => Effect.Effect<Option.Option<Evidence>, EvidenceReadError>;
  readonly graph: GraphState;
  readonly path: string;
  /**
   * Produces a detached signature over the tag manifest, where this deployment
   * holds a key. Absent means the bundle is unsigned — and says so.
   */
  readonly signer?: BundleSigner;
  readonly steps: readonly Step[];
  /** Artifacts withheld from this case, by evidence id (TDR-024). */
  readonly withheld?: ReadonlyMap<string, Redaction>;
}

/**
 * Assemble a bundle on disk. Digests are computed from the bytes read back, not
 * copied from stored metadata — a digest taken from what we believe rather than
 * what is in the file would attest to nothing.
 */
export const writeBundle = (
  input: ExportInput
): Effect.Effect<Bundle, EvidenceReadError> =>
  Effect.gen(function* () {
    const dataDir = join(input.path, "data");
    const referenced = [
      ...new Set(input.steps.flatMap((step) => [...step.evidenceIds])),
    ];

    const exported: ExportedEvidence[] = [];
    const missing: string[] = [];
    const withheld: WithheldEvidence[] = [];
    const artifacts = new Map<string, Uint8Array>();

    for (const id of referenced) {
      const redaction = input.withheld?.get(id);
      if (redaction !== undefined) {
        // Declared, never dropped. A recipient can see that something was kept
        // back and ask about it; that is the difference between a redacted
        // document and an incomplete one.
        withheld.push({
          evidenceId: id,
          ground: redaction.ground,
          reason: redaction.reason,
          redactedAt: redaction.redactedAt.toISOString(),
          redactedBy: redaction.redactedBy,
        });
        continue;
      }
      const found = yield* input.evidence(id as EvidenceId);
      if (Option.isNone(found)) {
        // Recorded, not skipped: a bundle that silently drops an artifact looks
        // complete and is not.
        missing.push(id);
        continue;
      }
      const record = found.value;
      artifacts.set(record.id, record.bytes);
      exported.push({
        acquiredAt: record.acquiredAt.toISOString(),
        ...(record.acquiredBy === undefined
          ? {}
          : { acquiredBy: record.acquiredBy }),
        acquisitionPath: Schema.encodeUnknownSync(Schema.Any)(
          record.acquisitionPath
        ),
        byteLength: record.bytes.byteLength,
        contentType: record.contentType,
        evidenceId: record.id,
        file: `data/${record.id}`,
        sha256: sha256(record.bytes),
      });
    }

    const signing = yield* signingFor(input);

    const manifest: BundleManifest = {
      evidence: exported,
      exportedAt: input.at.toISOString(),
      graph: JSON.parse(
        JSON.stringify(Schema.encodeUnknownSync(Schema.Any)(input.graph))
      ),
      integrity: INTEGRITY_NOTE,
      missingEvidence: missing,
      signing,
      steps: input.steps.map((step) =>
        JSON.parse(JSON.stringify(Schema.encodeUnknownSync(Schema.Any)(step)))
      ),
      withheld,
    };

    yield* Effect.tryPromise({
      catch: (cause) =>
        EvidenceReadError.make({
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      try: async () => {
        await mkdir(dataDir, { recursive: true });

        await Promise.all(
          [...artifacts].map(([id, bytes]) =>
            writeFile(join(dataDir, id), bytes)
          )
        );

        await writeFile(
          join(input.path, "bagit.txt"),
          BAGIT_DECLARATION,
          "utf8"
        );
        const payloadManifest = `${exported
          .map((item) => `${item.sha256}  ${item.file}`)
          .join("\n")}\n`;
        await writeFile(
          join(input.path, "manifest-sha256.txt"),
          payloadManifest,
          "utf8"
        );
        const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
        await writeFile(
          join(input.path, "viokit-manifest.json"),
          manifestJson,
          "utf8"
        );

        // BagIt's own answer to "what covers the tag files" (RFC 8493 §2.2.1).
        // Emitted whether or not anyone signs: without it `viokit-manifest.json`
        // — the steps, the custody records, the withheld list — is covered by no
        // digest at all, and the trail could be altered undetected.
        const tagManifest = `${[
          [sha256(encodeUtf8(BAGIT_DECLARATION)), "bagit.txt"],
          [sha256(encodeUtf8(payloadManifest)), "manifest-sha256.txt"],
          [sha256(encodeUtf8(manifestJson)), "viokit-manifest.json"],
        ]
          .map(([digest, file]) => `${digest}  ${file}`)
          .join("\n")}\n`;
        await writeFile(
          join(input.path, "tagmanifest-sha256.txt"),
          tagManifest,
          "utf8"
        );

        // Signing the tag manifest covers everything transitively: artifacts
        // through the payload manifest, the trail through this one.
        const produced =
          input.signer === undefined
            ? undefined
            : Option.getOrUndefined(
                await Effect.runPromise(
                  input.signer.sign(encodeUtf8(tagManifest))
                )
              );
        if (produced !== undefined) {
          await writeFile(
            join(input.path, "tagmanifest-sha256.txt.sig"),
            produced.signature
          );
          await writeFile(
            join(input.path, "signing-key.pub.pem"),
            produced.publicKeyPem,
            "utf8"
          );
        }
      },
    });

    return { manifest, path: input.path };
  });
