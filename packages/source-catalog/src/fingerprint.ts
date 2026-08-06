const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

const utf8Bytes = (value: string): Uint8Array =>
  new TextEncoder().encode(value);

/**
 * Deterministic 64-bit FNV-1a hash of a string, as lowercase hex. Used to
 * content-address a source candidate's identity: identical `(domain, url)`
 * always produce the identical id, so duplicate submissions across agents
 * collapse to one record. Kept dependency free so it is portable and testable.
 */
export const fnv1aHex = (value: string): string => {
  let hash = FNV_OFFSET;
  for (const byte of utf8Bytes(value)) {
    // biome-ignore lint/suspicious/noBitwiseOperators: intentional FNV-1a hashing
    hash ^= BigInt(byte);
    // biome-ignore lint/suspicious/noBitwiseOperators: intentional FNV-1a hashing
    hash = (hash * FNV_PRIME) & MASK;
  }
  return hash.toString(16);
};

/** Content-hash identity of a candidate: a byte-stable form of `(domain, url)`. */
export const candidateFingerprint = (domain: string, url: string): string =>
  fnv1aHex(`${domain}\u0000${url}`);
