import { NativeDocuments, type DocumentsSpec } from '@backhaul/tracking-native';

/**
 * A file, handed to whatever the consignee uses.
 *
 * The delivery note is bytes from `documentPdf()` — no renderer, no
 * dependency (ADR-0024) — and the app has nowhere of its own to put a
 * file. The native seam writes them to the cache and offers them through
 * the share sheet as a file with a name. Absent in Jest, on the web console
 * and in an unlinked build, in which case the text note is what there is.
 */
export type DocumentsModule = DocumentsSpec | null;

/** Whether this build can hand a file over at all. The button is absent when it cannot. */
export function canHandOverFile(native: DocumentsModule = NativeDocuments ?? null): boolean {
  return native !== null;
}

/**
 * Offers `bytes` as a file. Resolves once the sheet is up; rejects only when
 * it could not open at all, which is the one case the screen says something.
 */
export async function handOverFile(
  bytes: Uint8Array,
  options: { readonly fileName: string; readonly mimeType: string; readonly title: string },
  native: DocumentsModule = NativeDocuments ?? null,
): Promise<void> {
  if (native === null) throw new Error('this build cannot hand over a file');
  await native.share(options.fileName, options.mimeType, toBase64(bytes), options.title);
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Base64, written out.
 *
 * Hermes has `btoa`, but it takes a string and a PDF is bytes; turning one
 * into the other through `String.fromCharCode` on a 400 KB photograph is a
 * stack the older handsets do not have. Twenty lines is cheaper than a
 * dependency and cheaper than finding out on a phone.
 */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(triple >> 18) & 63];
    out += ALPHABET[(triple >> 12) & 63];
    out += b === undefined ? '=' : ALPHABET[(triple >> 6) & 63];
    out += c === undefined ? '=' : ALPHABET[triple & 63];
  }
  return out;
}
