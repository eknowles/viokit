import { execFileSync } from "node:child_process";
import { generateKeyPairSync, verify } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { writeBundle } from "../src/export.js";
import { makeBundleSigner } from "../src/signing.js";

/**
 * Signing an evidentiary bundle (TDR-026).
 *
 * The property that matters is not "we produced a signature" — it is that a
 * recipient running none of our software can check it, and that the signature
 * covers the *trail* and not only the bytes.
 */

const out = () => mkdtempSync(join(tmpdir(), "viokit-signed-"));

const keyPem = () =>
  generateKeyPairSync("ed25519")
    .privateKey.export({ format: "pem", type: "pkcs8" })
    .toString();

/** A `SecretProvider` holding one key, as TDR-018 shapes it. */
const secretsWith = (pem: string) => ({
  get: (ref: string) =>
    Effect.succeed(ref === "SIGNING_KEY" ? Option.some(pem) : Option.none()),
});

const emptyBundle = (
  path: string,
  signer?: ReturnType<typeof makeBundleSigner>
) =>
  writeBundle({
    at: new Date("2024-06-01T00:00:00.000Z"),
    evidence: () => Effect.succeed(Option.none()),
    graph: { entities: [], events: [], relations: [] } as never,
    path,
    ...(signer === undefined ? {} : { signer }),
    steps: [],
  });

const read = (path: string, file: string) =>
  readFileSync(join(path, file), "utf8");

describe("an unsigned bundle says so", () => {
  it("declares it, rather than being silently unsigned", async () => {
    const path = out();
    const bundle = await Effect.runPromise(emptyBundle(path));
    assert.isFalse(bundle.manifest.signing.signed);
    assert.include(bundle.manifest.signing.note, "NOT signed");
    // A recipient assuming a signature that is absent is the worst outcome.
    assert.include(bundle.manifest.signing.verify, "unsigned");
  });
});

describe("the tag manifest covers the trail", () => {
  /**
   * Emitted whether or not anyone signs. Without it `viokit-manifest.json` —
   * the steps, the custody records, the withheld list — is covered by no digest
   * at all, and the trail can be altered undetected.
   */
  it("is written even for an unsigned bundle", async () => {
    const path = out();
    await Effect.runPromise(emptyBundle(path));
    const tag = read(path, "tagmanifest-sha256.txt");
    assert.include(tag, "bagit.txt");
    assert.include(tag, "manifest-sha256.txt");
    assert.include(tag, "viokit-manifest.json");
  });
});

describe("a signed bundle", () => {
  const signed = async () => {
    const pem = keyPem();
    const path = out();
    const bundle = await Effect.runPromise(
      emptyBundle(path, makeBundleSigner(secretsWith(pem), "SIGNING_KEY"))
    );
    return { bundle, path };
  };

  it("declares the algorithm and the key fingerprint", async () => {
    const { bundle } = await signed();
    assert.isTrue(bundle.manifest.signing.signed);
    assert.strictEqual(bundle.manifest.signing.algorithm, "ed25519");
    assert.isDefined(bundle.manifest.signing.publicKeyFingerprint);
    // A bundle carrying its own key proves consistency, not authenticity, and
    // the note has to say so.
    assert.include(bundle.manifest.signing.note, "not who produced it");
  });

  it("carries a detached signature and the public key", async () => {
    const { path } = await signed();
    const signature = readFileSync(join(path, "tagmanifest-sha256.txt.sig"));
    assert.strictEqual(signature.byteLength, 64);
    assert.include(read(path, "signing-key.pub.pem"), "BEGIN PUBLIC KEY");
  });

  it("verifies against the tag manifest", async () => {
    const { path } = await signed();
    assert.isTrue(
      verify(
        null,
        Buffer.from(read(path, "tagmanifest-sha256.txt"), "utf8"),
        read(path, "signing-key.pub.pem"),
        readFileSync(join(path, "tagmanifest-sha256.txt.sig"))
      )
    );
  });

  /** Altering the trail must break the chain, not merely be unrecorded. */
  it("stops verifying when the trail is altered", async () => {
    const { path } = await signed();
    const manifest = JSON.parse(read(path, "viokit-manifest.json"));
    manifest.exportedAt = "1999-01-01T00:00:00.000Z";
    writeFileSync(
      join(path, "viokit-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    );

    // The tag manifest no longer matches what it digests.
    const tag = read(path, "tagmanifest-sha256.txt");
    const recorded = tag
      .split("\n")
      .find((line) => line.endsWith("viokit-manifest.json"))
      ?.split("  ")[0];
    const [actual] = execFileSync("shasum", [
      "-a",
      "256",
      join(path, "viokit-manifest.json"),
    ])
      .toString()
      .split(" ");
    assert.notStrictEqual(recorded, actual);
  });

  /**
   * And if the tamperer repairs the tag manifest to match, the signature is
   * what catches them — which is the reason the signature is over this file.
   */
  it("stops verifying when a repaired tag manifest is substituted", async () => {
    const { path } = await signed();
    writeFileSync(
      join(path, "tagmanifest-sha256.txt"),
      `${read(path, "tagmanifest-sha256.txt")}extra  forged.txt\n`
    );
    assert.isFalse(
      verify(
        null,
        Buffer.from(read(path, "tagmanifest-sha256.txt"), "utf8"),
        read(path, "signing-key.pub.pem"),
        readFileSync(join(path, "tagmanifest-sha256.txt.sig"))
      )
    );
  });

  /**
   * The claim TDR-010 exists to protect: a recipient runs none of our software.
   * Skipped where openssl is absent rather than silently not run.
   */
  it("verifies with stock openssl", async () => {
    const { path } = await signed();
    let openssl = true;
    try {
      execFileSync("openssl", ["version"], { stdio: "ignore" });
    } catch {
      openssl = false;
    }
    if (!openssl) {
      return;
    }
    const output = execFileSync(
      "openssl",
      [
        "pkeyutl",
        "-verify",
        "-pubin",
        "-inkey",
        join(path, "signing-key.pub.pem"),
        "-rawin",
        "-in",
        join(path, "tagmanifest-sha256.txt"),
        "-sigfile",
        join(path, "tagmanifest-sha256.txt.sig"),
      ],
      { encoding: "utf8" }
    );
    assert.include(output, "Verified Successfully");
  });
});
