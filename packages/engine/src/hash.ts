const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/**
 * Deterministic 64-bit FNV-1a hash of a byte sequence, as a lowercase hex
 * string. Used to content-address evidence (I1): identical bytes always yield
 * the identical id, and any byte change yields a different id. Kept dependency
 * free and synchronous so it is portable across runtimes.
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
