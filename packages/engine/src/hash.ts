import { createHash } from "node:crypto";

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/**
 * Deterministic 64-bit FNV-1a hash of a byte sequence, as a lowercase hex
 * string.
 *
 * **Not for anything that attests to content.** FNV-1a is a hash-table
 * function: no preimage resistance, no collision resistance, and producing two
 * inputs with the same 64-bit output is cheap. Evidence identity and cache
 * fingerprints use `sha256Hex` for that reason (TDR-021).
 *
 * It remains right for identifiers that merely *name* things — step ids,
 * view-state file paths — where no guarantee is being offered and implying one
 * with a cryptographic hash would be worse than using this.
 */
export const fnv1aHex = (bytes: Uint8Array): string => {
  let hash = FNV_OFFSET;
  for (const byte of bytes) {
    // biome-ignore lint/suspicious/noBitwiseOperators: intentional FNV-1a hashing
    hash ^= BigInt(byte);
    // biome-ignore lint/suspicious/noBitwiseOperators: intentional FNV-1a hashing
    hash = (hash * FNV_PRIME) & MASK;
  }
  return hash.toString(16);
};

/**
 * Cryptographic digest of a byte sequence, as lowercase hex (TDR-021).
 *
 * This is what an evidence identifier is: the id *is* the digest, so
 * `shasum -a 256 <artifact>` checks an artifact against its own identifier with
 * no tooling of ours — which is the property an evidentiary bundle is sold on.
 *
 * `node:crypto` rather than a Bun global: the engine is a library and TDR-001
 * keeps Node a drop-in target.
 */
export const sha256Hex = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
