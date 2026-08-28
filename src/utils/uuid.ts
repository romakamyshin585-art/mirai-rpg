/**
 * RFC 4122 v4 UUIDs without any external dependency.
 * Uses crypto.getRandomValues when available, falls back to Math.random.
 * Sufficient for local-only IDs in a single-user app.
 */

function hex(n: number, w: number): string {
  let s = n.toString(16);
  while (s.length < w) s = '0' + s;
  return s;
}

export function uuid(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Per RFC: set version 4 in the high nibble of byte 6, variant in byte 8
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const b = bytes;
  return (
    hex(b[0], 2) + hex(b[1], 2) + hex(b[2], 2) + hex(b[3], 2) + '-' +
    hex(b[4], 2) + hex(b[5], 2) + '-' +
    hex(b[6], 2) + hex(b[7], 2) + '-' +
    hex(b[8], 2) + hex(b[9], 2) + '-' +
    hex(b[10], 2) + hex(b[11], 2) + hex(b[12], 2) + hex(b[13], 2) + hex(b[14], 2) + hex(b[15], 2)
  );
}
