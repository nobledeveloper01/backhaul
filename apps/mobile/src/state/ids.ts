/**
 * Client-generated ids.
 *
 * Several routes take the id from the caller so a retry is a no-op rather than
 * a second row: a position sample, a message, a levy at a checkpoint. That only
 * works if the id is one the server will accept, and every one of those columns
 * is a `Guid`.
 *
 * The fallback matters more than it looks. `crypto.randomUUID` is present on
 * every modern engine, and the one place it is not is exactly the place this
 * product cares about — an old Transsion handset on an old WebView. A fallback
 * that produced `b18f2a-3c9e01` looked like an id and was rejected by the
 * server with a model-binding error about nothing.
 */
export function newId(): string {
  const maybeCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof maybeCrypto?.randomUUID === 'function') {
    return maybeCrypto.randomUUID();
  }

  // A version-4 UUID by hand. Not cryptographically strong — `Math.random` is
  // not — and it does not need to be: this is a deduplication key, not a
  // secret. What it needs is to be unique on one device and shaped like a
  // GUID, and it is both.
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      // The variant nibble: one of 8, 9, a, b.
      out += hex[8 + Math.floor(Math.random() * 4)];
    } else {
      out += hex[Math.floor(Math.random() * 16)];
    }
  }
  return out;
}
