import { canHandOverFile, handOverFile, toBase64 } from '../src/native/documents';
import type { DocumentsSpec } from '@backhaul/tracking-native';

/**
 * The seam that hands a file over, held to doing only that.
 *
 * The bytes come from the domain and go to the platform; what this side adds
 * is the encoding in between and the decision to show the button at all.
 */
describe('handing a file over', () => {
  test('base64 agrees with the reference for every padding case', () => {
    // Node's own encoder is the reference; it is reached through `globalThis`
    // because the app's tsconfig, rightly, knows nothing about Node.
    const reference = (globalThis as unknown as { Buffer: { from: (b: Uint8Array) => { toString: (enc: string) => string } } }).Buffer;
    for (const length of [0, 1, 2, 3, 4, 5, 6, 300, 301, 302]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + 11) & 0xff);
      expect(toBase64(bytes)).toBe(reference.from(bytes).toString('base64'));
    }
  });

  test('is absent in a build with no seam, and says so', async () => {
    expect(canHandOverFile(null)).toBe(false);
    await expect(
      handOverFile(Uint8Array.from([1, 2, 3]), {
        fileName: 'x.pdf',
        mimeType: 'application/pdf',
        title: 'x',
      }, null),
    ).rejects.toThrow(/cannot hand over a file/);
  });

  test('passes the file through, encoded, under the caller’s name', async () => {
    const calls: unknown[][] = [];
    const native: DocumentsSpec = {
      share: (...args) => {
        calls.push(args);
        return Promise.resolve();
      },
    };

    expect(canHandOverFile(native)).toBe(true);
    await handOverFile(
      Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
      { fileName: 'delivery-note-7A2C.pdf', mimeType: 'application/pdf', title: 'Delivery note' },
      native,
    );

    expect(calls).toEqual([['delivery-note-7A2C.pdf', 'application/pdf', 'JVBERg==', 'Delivery note']]);
  });
});
