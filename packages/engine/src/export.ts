import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Evidence, EvidenceId, GraphState, Step } from "@viokit/schema";
import { EvidenceReadError } from "@viokit/schema";
import { Effect, Option, Schema } from "effect";

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
  "Each artifact's evidenceId IS the SHA-256 digest of its bytes, and manifest-sha256.txt records the same digest in BagIt form. Verifying an artifact therefore also confirms it is the one the steps reference: `shasum -a 256 -c manifest-sha256.txt`. This attests that the artifacts are as they were at export; it does not attest to custody before export, which would require signing at acquisition. Where an artifact records `acquiredBy`, that is the principal this deployment authenticated as obtaining it — an unsigned assertion by the exporting deployment, not a cryptographic proof.";

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

export interface BundleManifest {
  readonly evidence: readonly ExportedEvidence[];
  readonly exportedAt: string;
  readonly graph: unknown;
  readonly integrity: string;
  /** Artifacts a step references that the store could not produce. */
  readonly missingEvidence: readonly string[];
  readonly steps: readonly unknown[];
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
const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

export interface ExportInput {
  readonly at: Date;
  readonly evidence: (
    id: EvidenceId
  ) => Effect.Effect<Option.Option<Evidence>, EvidenceReadError>;
  readonly graph: GraphState;
  readonly path: string;
  readonly steps: readonly Step[];
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
    const artifacts = new Map<string, Uint8Array>();

    for (const id of referenced) {
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

    const manifest: BundleManifest = {
      evidence: exported,
      exportedAt: input.at.toISOString(),
      graph: JSON.parse(
        JSON.stringify(Schema.encodeUnknownSync(Schema.Any)(input.graph))
      ),
      integrity: INTEGRITY_NOTE,
      missingEvidence: missing,
      steps: input.steps.map((step) =>
        JSON.parse(JSON.stringify(Schema.encodeUnknownSync(Schema.Any)(step)))
      ),
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
        await writeFile(
          join(input.path, "manifest-sha256.txt"),
          `${exported.map((item) => `${item.sha256}  ${item.file}`).join("\n")}\n`,
          "utf8"
        );
        await writeFile(
          join(input.path, "viokit-manifest.json"),
          `${JSON.stringify(manifest, null, 2)}\n`,
          "utf8"
        );
      },
    });

    return { manifest, path: input.path };
  });
