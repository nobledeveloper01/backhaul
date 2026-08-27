import { newId } from '../src/state/ids';

/**
 * Several routes take the id from the caller so a retry is a no-op rather than
 * a second row — a position sample, a message, a levy at a checkpoint. Every
 * one of those columns is a `Guid`, so an id that is not shaped like one is
 * rejected by the server with a model-binding error about nothing.
 */
describe('a client-generated id', () => {
  const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  test('is a GUID the server will accept', () => {
    expect(newId()).toMatch(GUID);
  });

  test('and still is when the engine has no randomUUID', () => {
    // The one engine that lacks it is exactly the one this product cares
    // about: an old Transsion handset on an old WebView. The fallback used to
    // produce `b18f2a-3c9e01`, which looks like an id and is not one.
    const real = (globalThis as { crypto?: unknown }).crypto;
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });

    try {
      for (let i = 0; i < 200; i++) expect(newId()).toMatch(GUID);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
    }
  });

  test('and does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 1000 }, newId));
    expect(seen.size).toBe(1000);
  });
});
