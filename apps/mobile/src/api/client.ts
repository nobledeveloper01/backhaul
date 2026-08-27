import { DEFAULT_SHARE_DAYS } from '@backhaul/domain';
import type { Position, ShareScope, TripEvent, TripState } from '@backhaul/domain';

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
  /**
   * The server answered, and said no.
   *
   * A 401 means the token is missing, wrong or expired. A 404 on a trip may
   * mean it does not exist *or* that this caller may not see it — the server
   * does not distinguish, on purpose, because the existence of a trip id is
   * itself information.
   */
  | {
      readonly kind: 'refused';
      readonly status: number;
      readonly detail: string;
      /**
       * The server's machine-readable reason, where it gives one.
       *
       * `detail` is a sentence written for a person and it is written in
       * English — one language, because the server has one and the parity
       * fixtures hold both implementations to the same words. The app is read
       * in four. So the code is what a screen renders from, and the sentence
       * is the fallback for a code the app has not seen before.
       *
       * Null when the server did not name one, which is not a bug: not every
       * refusal has a short name worth inventing.
       */
      readonly code: string | null;
    };

export type ApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: ApiFailure };

/** Who can see a trip: its driver, its carrier and its shipper. */
export interface TripParties {
  readonly driverId: string;
  readonly carrierId: string;
  readonly shipperId: string;
}

/**
 * One trip on a list.
 *
 * No history: a list renders a corridor, a state and an age, and loading a
 * three-day trip's events to draw one line of it is what makes a list of
 * twenty trips slow enough that nobody opens it twice.
 */
export interface TripSummaryView {
  readonly id: string;
  readonly origin: string;
  readonly destination: string;
  readonly state: TripState;
  readonly tracking: boolean;
  readonly startedAt: Date;
  /**
   * When a position last arrived, or null if none ever has.
   *
   * Null is not "a long time ago". A list that renders it as one has told a
   * shipper their truck went quiet when it never started — which is the
   * distinction `PositionAge` exists to keep.
   */
  readonly lastSeenAt: Date | null;
  readonly hasOpenIncident: boolean;
}

export interface TripView {
  readonly id: string;
  readonly state: TripState;
  readonly tracking: boolean;
  readonly allowedNext: readonly TripState[];
  readonly history: readonly TripEvent[];
}

export interface RequestedCode {
  /** The number as it will be shown back: `0803 123 4567`. */
  readonly phone: string;
  /** How long until another code may be asked for. */
  readonly resendInMs: number;
  /**
   * Present only when the server has no SMS gateway.
   *
   * Development convenience, and the server refuses to run in that mode
   * against a real database. A client that *relies* on it would break the
   * moment a gateway exists, which is why nothing does.
   */
  readonly developmentCode: string | null;
}

export interface SignedIn {
  readonly token: string;
  readonly userId: string;
  readonly role: 'driver' | 'carrier' | 'shipper';
  readonly name: string;
  /** Whether this number has just been seen for the first time. */
  readonly isNew: boolean;
}

/** A link, as its issuer sees it. Never carries the token. */
export interface ShareLinkView {
  readonly id: string;
  readonly scope: ShareScope;
  readonly label: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface IssuedShareView extends ShareLinkView {
  /** Shown once and never retrievable. */
  readonly token: string;
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
  private token: string | null;

  constructor(
    baseUrl: string = DEFAULT_BASE_URL,
    token: string | null = null,
    timeoutMs: number = 8000,
  ) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Sets or clears the bearer token.
   *
   * Held in memory only. A token belongs in the Keychain or the Keystore, and
   * `AsyncStorage` is neither — it is unencrypted on disk, which is fine for
   * an appearance preference and not for a credential. Secure storage arrives
   * with the phone-plus-OTP exchange in phase 3; until then a token lives as
   * long as the process and is passed in at construction.
   */
  /**
   * What to do when the server stops recognising the token.
   *
   * A 401 is not an error a screen can recover from: retrying sends the same
   * dead token, and the person is left reading "this endpoint needs a bearer
   * token" with a button that does nothing. Every error path has a forward
   * path, and the forward path from an unknown token is the sign-in screen.
   *
   * Set once by `SessionProvider`. Kept here rather than checked at each call
   * site because it has to hold for the call sites written next year.
   */
  onUnauthorised: (() => void) | null = null;

  setToken(token: string | null): void {
    this.token = token;
  }

  /**
   * Asks for a sign-in code.
   *
   * Deliberately says nothing about whether the number is known: telling a
   * caller which numbers are registered turns this into a way to find out who
   * uses Backhaul.
   */
  async requestCode(phone: string): Promise<ApiResult<RequestedCode>> {
    return this.request<RequestedCode>('POST', '/v1/auth/request', { phone });
  }

  /**
   * Turns a code into a token.
   *
   * Sets the token on this client on success, so a caller that verifies is
   * immediately able to use everything else. The caller still has to persist
   * it — this object does not outlive the process.
   */
  async verifyCode(phone: string, code: string): Promise<ApiResult<SignedIn>> {
    const result = await this.request<SignedIn>('POST', '/v1/auth/verify', { phone, code });
    if (result.ok) this.setToken(result.value.token);
    return result;
  }

  async me(): Promise<ApiResult<SignedIn>> {
    return this.request<SignedIn>('GET', '/v1/me');
  }

  async setName(name: string): Promise<ApiResult<null>> {
    return this.request<null>('PUT', '/v1/me/name', { name });
  }

  async health(): Promise<ApiResult<{ status: string; store: string; durable: boolean }>> {
    return this.request('GET', '/healthz');
  }

  /**
   * Opens a trip.
   *
   * The three parties are fixed here and are what every later read is filtered
   * against — the caller must be one of them or the server refuses. See
   * ADR-0008.
   */
  async openTrip(
    id: string,
    parties: TripParties,
    corridor: { readonly origin: string; readonly destination: string },
    at: Date,
    actor: TripEvent['actor'],
    note?: string,
  ): Promise<ApiResult<TripView>> {
    const result = await this.request<RawTrip>('POST', `/v1/trips/${id}`, {
      driverId: parties.driverId,
      carrierId: parties.carrierId,
      shipperId: parties.shipperId,
      origin: corridor.origin,
      destination: corridor.destination,
      at: at.toISOString(),
      actor,
      ...(note === undefined ? {} : { note }),
    });
    return map(result, toTrip);
  }

  /**
   * Every trip this caller may see, newest first.
   *
   * Filtered on the server by the same engine the app filters with, so a
   * search that finds a trip on the phone finds it here — see `search.ts`.
   */
  async trips(filter?: {
    readonly text?: string;
    readonly states?: readonly TripState[];
    readonly onlyWithIncidents?: boolean;
  }): Promise<ApiResult<readonly TripSummaryView[]>> {
    const query = new URLSearchParams();
    if (filter?.text !== undefined && filter.text.trim() !== '') query.set('text', filter.text);
    if (filter?.states !== undefined && filter.states.length > 0) {
      query.set('states', filter.states.join(','));
    }
    if (filter?.onlyWithIncidents === true) query.set('onlyWithIncidents', 'true');

    const suffix = query.toString() === '' ? '' : `?${query.toString()}`;

    return map(
      await this.request<readonly RawTripSummary[]>('GET', `/v1/trips${suffix}`),
      (rows) => rows.map(toSummary),
    );
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

  /**
   * Issues a share link, and returns the token **once**.
   *
   * The server stores only a hash, so this response is the only time the token
   * exists in readable form anywhere. A caller that discards it cannot get it
   * back and has to issue another. See ADR-0010.
   */
  async issueShare(
    tripId: string,
    scope: ShareScope,
    label: string,
    days = DEFAULT_SHARE_DAYS,
  ): Promise<ApiResult<IssuedShareView>> {
    return this.request<IssuedShareView>('POST', `/v1/trips/${tripId}/share`, {
      scope,
      label,
      days,
    });
  }

  async shareLinks(tripId: string): Promise<ApiResult<readonly ShareLinkView[]>> {
    return this.request<readonly ShareLinkView[]>('GET', `/v1/trips/${tripId}/share`);
  }

  async revokeShare(tripId: string, linkId: string): Promise<ApiResult<null>> {
    return this.request<null>('DELETE', `/v1/trips/${tripId}/share/${linkId}`);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    // An explicit timeout, because a request that never settles is
    // indistinguishable from a hung screen — and on a bad connection the
    // default is minutes.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {};
      if (body !== undefined) {
        headers['content-type'] = 'application/json';
      }
      if (this.token !== null) {
        headers['authorization'] = `Bearer ${this.token}`;
      }

      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal: abort.signal,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      if (!response.ok) {
        // Before anything else, and only when a token was actually sent: a
        // 401 on an unauthenticated call is the endpoint saying "sign in",
        // not the session saying "you have been signed out".
        if (response.status === 401 && this.token !== null) {
          this.onUnauthorised?.();
        }

        const refusal = await readRefusal(response);
        return {
          ok: false,
          failure: {
            kind: 'refused',
            status: response.status,
            detail: refusal.detail,
            code: refusal.code,
          },
        };
      }

      // 204 has no body, and `json()` on an empty one throws
      // "Unexpected end of JSON input" — which surfaced as a *failed* revoke
      // on a revoke that had in fact succeeded. A successful call reporting
      // failure is worse than the reverse: the caller retries something that
      // already happened.
      if (response.status === 204) {
        return { ok: true, value: null as T };
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
 * The server's reason for saying no: its code and its sentence.
 *
 * A refusal from the trip machine carries wording written to be shown to a
 * driver at a loading bay, and replacing it with "Request failed with status
 * 422" throws away the only useful part of the response. But the wording is
 * English, so the *code* beside it is what a screen in four languages renders
 * from — see `ApiFailure`.
 */
async function readRefusal(
  response: Response,
): Promise<{ readonly code: string | null; readonly detail: string }> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>;

      const code = record['refusal'] ?? record['reason'];
      const message = record['message'] ?? record['detail'] ?? record['title'];

      return {
        code: typeof code === 'string' ? code : null,
        detail:
          typeof message === 'string' ? message : `The server answered ${response.status}.`,
      };
    }
  } catch {
    // A body that is not JSON is not a reason to lose the status code.
  }
  return { code: null, detail: `The server answered ${response.status}.` };
}

interface RawTripSummary {
  id: string;
  origin: string;
  destination: string;
  state: TripState;
  tracking: boolean;
  startedAt: string;
  lastSeenAt: string | null;
  hasOpenIncident: boolean;
}

function toSummary(raw: RawTripSummary): TripSummaryView {
  return {
    id: raw.id,
    origin: raw.origin,
    destination: raw.destination,
    state: raw.state,
    tracking: raw.tracking,
    startedAt: new Date(raw.startedAt),
    // Null stays null. `new Date(null)` is 1970, which would render as
    // "56 years ago" beside a truck that has not started.
    lastSeenAt: raw.lastSeenAt === null ? null : new Date(raw.lastSeenAt),
    hasOpenIncident: raw.hasOpenIncident,
  };
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
