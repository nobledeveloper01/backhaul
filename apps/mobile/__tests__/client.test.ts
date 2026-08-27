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

/**
 * The headers of the most recent fetch.
 *
 * `jest.Mock`'s `calls` is `any[][]`, so indexing into it is an unsafe access
 * however it is written. Narrowing the whole array once, here, keeps that in
 * one place instead of at every call site.
 */
function lastHeaders(): Record<string, string> {
  const mock = globalThis.fetch as unknown as jest.Mock;
  const calls = mock.mock.calls as [string, { headers?: Record<string, string> }][];
  return calls[0]?.[1]?.headers ?? {};
}

describe('the bearer token', () => {
  test('is sent when there is one, and absent when there is not', async () => {
    respondWith(200, { status: 'ok', store: 'in-memory', durable: false });

    await new BackhaulApi('http://x', 'a-token').health();
    expect(lastHeaders()['authorization']).toBe('Bearer a-token');

    respondWith(200, { status: 'ok', store: 'in-memory', durable: false });
    await new BackhaulApi('http://x').health();
    expect(lastHeaders()['authorization']).toBeUndefined();
  });

  test('a 401 is a refusal with the status, not a network failure', async () => {
    // The two have different remedies — get a token, versus wait for signal —
    // and a client that collapses them leaves the app unable to say which.
    respondWith(401, { message: 'This endpoint needs a bearer token.' });

    const result = await new BackhaulApi('http://x').trip('a-trip');
    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'refused') return;
    expect(result.failure.status).toBe(401);
  });

  test('setToken replaces it', async () => {
    const api = new BackhaulApi('http://x', 'first');
    api.setToken('second');

    respondWith(200, { status: 'ok', store: 'in-memory', durable: false });
    await api.health();

    expect(lastHeaders()['authorization']).toBe('Bearer second');
  });
});

describe('a response with no body', () => {
  test('204 succeeds rather than failing to parse nothing', async () => {
    // Revoking a share link answers 204. Calling `json()` on an empty body
    // throws "Unexpected end of JSON input", and the revoke — which had in
    // fact succeeded — was reported as a failure. A successful call reporting
    // failure is worse than the reverse: the caller retries something that
    // already happened, and here that means telling somebody their link was
    // turned off twice.
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
    });

    const result = await new BackhaulApi().revokeShare('a-trip', 'a-link');

    expect(result.ok).toBe(true);
  });
});

describe('an unreachable server', () => {
  /*
    This is the failure that has no sentence.

    Everywhere else the server's own wording is shown verbatim, because it
    knows things the screen does not and `otp.ts` holds both sides to the same
    words. When the request never arrives there is no server and no wording,
    and the client used to fill the hole with `error.message` — which put
    "Network request failed" in front of somebody reading Yorùbá.

    The kind is what the screen needs. The detail is for a log.
  */
  test('is reported as a kind, not as a sentence to show anybody', async () => {
    const api = new BackhaulApi('http://127.0.0.1:9', null);
    const result = await api.requestCode('+2348031234567');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('unreachable');
  });
});

describe('a refusal', () => {
  /*
    The server sends a code and a sentence, and the app needs both.

    The sentence is English — it is what an API consumer reads and what the
    parity fixtures hold both implementations to, character for character. The
    app is read in four languages, so a screen renders from the code and keeps
    the sentence as the fallback for a code it has not seen.

    This asserts the client does not throw either half away, which it did:
    `readDetail` returned only the message and the code went in the bin.
  */
  test('carries the code as well as the sentence', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ refusal: 'too_soon', message: 'A code was just sent.' }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const api = new BackhaulApi('http://example.test', null);
    const result = await api.requestCode('+2348031234567');

    expect(result.ok).toBe(false);
    if (result.ok || result.failure.kind !== 'refused') throw new Error('expected a refusal');
    expect(result.failure.code).toBe('too_soon');
    expect(result.failure.detail).toBe('A code was just sent.');
  });

  test('and reports a missing code as missing rather than as a guess', async () => {
    // Not every refusal has a short name worth inventing. Null is the honest
    // answer, and it is what makes the screen fall back to the server's words.
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'No.' }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const api = new BackhaulApi('http://example.test', null);
    const result = await api.requestCode('+2348031234567');

    if (result.ok || result.failure.kind !== 'refused') throw new Error('expected a refusal');
    expect(result.failure.code).toBeNull();
    expect(result.failure.detail).toBe('No.');
  });
});
