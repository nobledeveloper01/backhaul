import { BackhaulApi } from '../src/api/client';

/**
 * The client's job is to fail well.
 *
 * A driver on a northern corridor is offline for hours at a time, so a failed
 * request is a normal condition rather than an error path — and these tests
 * are mostly about what happens when the server is not there.
 */

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function respondWith(status: number, body: unknown): void {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

function failWith(message: string): void {
  globalThis.fetch = jest.fn().mockRejectedValue(new Error(message));
}

describe('when the server is not there', () => {
  test('a dead network is unreachable, not a throw', async () => {
    // A client that throws on a failed fetch turns the normal case into an
    // error path, and error paths are where offline apps die.
    failWith('Network request failed');
    const result = await new BackhaulApi().trip('a-trip');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('unreachable');
  });

  test('an upload that never arrives says so, so the phone keeps its rows', async () => {
    // The device deletes its local rows on an acknowledgement and on nothing
    // else. A failure that read as success would destroy the evidence.
    failWith('Network request failed');
    const result = await new BackhaulApi().uploadBatch('batch', 'trip', []);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('unreachable');
  });
});

describe('when the server refuses', () => {
  test("the machine's own sentence survives, not a status line", async () => {
    // A refusal from the trip machine is written to be shown to a driver at a
    // loading bay. Replacing it with "Request failed with status 422" throws
    // away the only useful part of the response.
    respondWith(422, {
      message: "A trip cannot go from 'open' to 'delivered'.",
      refusal: 'not_allowed',
    });

    const result = await new BackhaulApi().recordEvent(
      'a-trip',
      'delivered',
      new Date('2026-03-04T06:00:00.000Z'),
      'driver',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('refused');
    if (result.failure.kind !== 'refused') return;
    expect(result.failure.status).toBe(422);
    expect(result.failure.detail).toBe("A trip cannot go from 'open' to 'delivered'.");
  });

  test('a body that is not JSON still keeps the status', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.reject(new Error('not json')),
    });

    const result = await new BackhaulApi().trip('a-trip');
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'refused') return;
    expect(result.failure.status).toBe(502);
  });
});

describe('what comes back', () => {
  test('timestamps arrive as Dates, because every engine takes one', async () => {
    respondWith(200, {
      id: 'a-trip',
      state: 'in_transit',
      tracking: true,
      allowedNext: ['signal_lost', 'stalled', 'arrived', 'disputed'],
      history: [
        { state: 'open', at: '2026-03-04T06:00:00.000Z', actor: 'shipper', note: null },
        { state: 'assigned', at: '2026-03-04T06:30:00.000Z', actor: 'carrier', note: 'ok' },
      ],
    });

    const result = await new BackhaulApi().trip('a-trip');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [first, second] = result.value.history;
    expect(first?.at).toBeInstanceOf(Date);
    expect(first?.at.toISOString()).toBe('2026-03-04T06:00:00.000Z');

    // A null note from JSON is an absent note, not a note whose value is null.
    expect(first && 'note' in first).toBe(false);
    expect(second?.note).toBe('ok');
  });

  test('the trip machine still governs what the app offers', async () => {
    // The server sends `allowedNext`; the app renders it rather than deciding
    // for itself. Two implementations of the edge set is two answers.
    respondWith(200, {
      id: 'a-trip',
      state: 'arrived',
      tracking: false,
      allowedNext: ['delivered', 'disputed'],
      history: [{ state: 'open', at: '2026-03-04T06:00:00.000Z', actor: 'shipper' }],
    });

    const result = await new BackhaulApi().trip('a-trip');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.allowedNext).toEqual(['delivered', 'disputed']);
    expect(result.value.tracking).toBe(false);
  });
});
