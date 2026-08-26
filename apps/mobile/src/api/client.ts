import type { Position, TripEvent, TripState } from '@backhaul/domain';

/**
 * The API client.
 *
 * Deliberately thin: it moves JSON and converts timestamps, and it decides
 * nothing. Every rule the app applies to what comes back — whether a fix is
 * usable, what a trip may do next, when silence means something — is applied by
 * `@backhaul/domain`, which is the same code the server ran before it stored
 * any of it. See ADR-0005.
 *
 * **Every method can fail, and none of them throw for it.** A driver on a
 * northern corridor is offline for hours at a time; a client that throws on a
 * failed fetch turns a normal condition into an error path, and error paths
 * are where offline apps die. Callers get a sealed result and have to say what
 * they will render when the network is not there.
 */

export type ApiFailure =
  /** No network, or the server did not answer. */
  | { readonly kind: 'unreachable'; readonly detail: string }
  /** The server answered, and said no. */
  | { readonly kind: 'refused'; readonly status: number; readonly detail: string };

export type ApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ApiFailure };

export interface TripView {
  readonly id: string;
  readonly state: TripState;
  readonly tracking: boolean;
  readonly allowedNext: readonly TripState[];
  readonly history: readonly TripEvent[];
}

export interface TrackView {
  readonly kept: number;
  readonly dropped: number;
  readonly quality: number;
  readonly distanceMetres: number;
  readonly observation: string;
  readonly silentForMs: number | null;
}

export interface BatchOutcome {
  readonly batchId: string;
  readonly accepted: number;
  readonly duplicate: number;
  readonly replayed: boolean;
}

/**
 * Where the server is.
 *
 * `10.0.2.2` is the Android emulator's route to the host machine; the iOS
 * simulator shares the host's loopback. Neither is a deployment address — there
 * is no deployed server and the client is not pretending otherwise.
 */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:5111';

export class BackhaulApi {
  // Written out rather than as constructor parameter properties. Node's
  // type-stripping — which runs the domain's tests and the round-trip check
  // with no build step — cannot erase a parameter property, because it would
  // have to *emit* the assignment rather than delete a type. Everything in
  // this repository that a script might import has to stay strip-compatible.
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string = DEFAULT_BASE_URL, timeoutMs: number = 8000) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
  }

  async health(): Promise<ApiResult<{ status: string; store: string; durable: boolean }>> {
    return this.request('GET', '/healthz');
  }

  async openTrip(
    id: string,
    at: Date,
    actor: TripEvent['actor'],
    note?: string,
  ): Promise<ApiResult<TripView>> {
    const result = await this.request<RawTrip>('POST', `/v1/trips/${id}`, {
      at: at.toISOString(),
      actor,
      ...(note === undefined ? {} : { note }),
    });
    return map(result, toTrip);
  }

  async trip(id: string): Promise<ApiResult<TripView>> {
    return map(await this.request<RawTrip>('GET', `/v1/trips/${id}`), toTrip);
  }

  async recordEvent(
    id: string,
    state: TripState,
    at: Date,
    actor: TripEvent['actor'],
    note?: string,
  ): Promise<ApiResult<TripView>> {
    const result = await this.request<RawTrip>('POST', `/v1/trips/${id}/events`, {
      state,
      at: at.toISOString(),
      actor,
      ...(note === undefined ? {} : { note }),
    });
    return map(result, toTrip);
  }

  /**
   * Uploads a batch of position samples.
   *
   * **The caller must not delete its local rows until this resolves `ok`.**
   * That is the whole durability contract: the server acknowledges only once
   * the batch is committed, and an acknowledgement is the only thing that
   * makes deleting safe. A `unreachable` failure means the samples are still
   * only on this phone.
   */
  async uploadBatch(
    batchId: string,
    tripId: string,
    samples: readonly (Position & { id: string })[],
  ): Promise<ApiResult<BatchOutcome>> {
    return this.request<BatchOutcome>('POST', '/v1/tracking/batch', {
      batchId,
      tripId,
      samples: samples.map((sample) => ({
        id: sample.id,
        lat: sample.lat,
        lon: sample.lon,
        accuracy: sample.accuracy,
        at: sample.at.toISOString(),
        ...(sample.speed === undefined ? {} : { speed: sample.speed }),
        ...(sample.battery === undefined ? {} : { battery: sample.battery }),
      })),
    });
  }

  async track(tripId: string): Promise<ApiResult<TrackView>> {
    return this.request<TrackView>('GET', `/v1/tracking/trip/${tripId}/track`);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    // An explicit timeout, because a request that never settles is
    // indistinguishable from a hung screen — and on a bad connection the
    // default is minutes.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: abort.signal,
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      if (!response.ok) {
        return {
          ok: false,
          failure: {
            kind: 'refused',
            status: response.status,
            detail: await readDetail(response),
          },
        };
      }

      return { ok: true, value: (await response.json()) as T };
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: 'unreachable',
          detail: error instanceof Error ? error.message : 'The server did not answer.',
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * The server's own sentence, where it has one.
 *
 * A refusal from the trip machine carries wording written to be shown to a
 * driver at a loading bay. Replacing it with "Request failed with status 422"
 * throws away the only useful part of the response.
 */
async function readDetail(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;
      const message = record['message'] ?? record['detail'] ?? record['title'];
      if (typeof message === 'string') return message;
    }
  } catch {
    // A body that is not JSON is not a reason to lose the status code.
  }
  return `The server answered ${response.status}.`;
}

interface RawTrip {
  id: string;
  state: TripState;
  tracking: boolean;
  allowedNext: TripState[];
  history: {
    state: TripState;
    at: string;
    actor: TripEvent['actor'];
    note?: string | null;
  }[];
}

function toTrip(raw: RawTrip): TripView {
  return {
    id: raw.id,
    state: raw.state,
    tracking: raw.tracking,
    allowedNext: raw.allowedNext,
    history: raw.history.map((event) => ({
      state: event.state,
      // JSON carries a string; every engine downstream takes a Date, and
      // parsing here means exactly one place gets it wrong if it is wrong.
      at: new Date(event.at),
      actor: event.actor,
      ...(event.note === undefined || event.note === null ? {} : { note: event.note }),
    })),
  };
}

function map<A, B>(result: ApiResult<A>, f: (value: A) => B): ApiResult<B> {
  return result.ok ? { ok: true, value: f(result.value) } : result;
}
