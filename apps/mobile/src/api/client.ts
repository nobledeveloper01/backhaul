import { DEFAULT_SHARE_DAYS } from '@backhaul/domain';
import type {
  CleanedTrack,
  FixProblem,
  Position,
  ShareScope,
  TripEvent,
  TripState,
} from '@backhaul/domain';

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
  /**
   * The three parties, by id.
   *
   * Only ever sent to the three of them — this read is behind the same query
   * filter as every other. They are here because a party needs to reach the
   * others' records: a shipper reviewing a carrier has to name which carrier,
   * and an id is the only handle that is stable and carries nothing about
   * anybody. A share link's view carries none of this.
   */
  readonly driverId: string;
  readonly carrierId: string;
  readonly shipperId: string;
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
/**
 * A link on a trip, as the list gives it.
 *
 * The timestamps are strings here and `Date` almost everywhere else, and that
 * is a wart rather than a decision: these two types predate the rest and the
 * screens that read them parse where they use them. Worth unifying the day
 * something else needs them.
 *
 * There is no token. A token is shown once, at issue, and is never retrievable
 * — so revoking works from the `id`, and a list that carried tokens would be a
 * list that leaks every link on the trip to whoever opens the screen.
 */
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

  /**
   * Sets or clears the bearer token.
   *
   * Held in memory only. A token belongs in the Keychain or the Keystore, and
   * `AsyncStorage` is neither — it is unencrypted on disk, which is fine for
   * an appearance preference and not for a credential. Secure storage arrives
   * with the phone-plus-OTP exchange in phase 3; until then a token lives as
   * long as the process and is passed in at construction.
   */
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


  // --- the trip's own detail ---------------------------------------------

  /**
   * The thread on a trip.
   *
   * Two timestamps per message, always. `at` is when it was written and
   * `receivedAt` is when the server took it, and the gap between them is what
   * tells a late report from a late delivery.
   */
  async messages(tripId: string): Promise<ApiResult<readonly MessageView[]>> {
    return map(
      await this.request<readonly RawMessage[]>('GET', `/v1/trips/${tripId}/messages`),
      (rows) => rows.map(toMessage),
    );
  }

  async sendMessage(
    tripId: string,
    message: { readonly id: string; readonly from: string; readonly body: string; readonly at: Date },
  ): Promise<ApiResult<MessageView>> {
    return map(
      await this.request<RawMessage>('POST', `/v1/trips/${tripId}/messages`, {
        id: message.id,
        from: message.from,
        body: message.body,
        at: message.at.toISOString(),
      }),
      toMessage,
    );
  }

  async markRead(tripId: string, by: string): Promise<ApiResult<null>> {
    return this.request<null>('POST', `/v1/trips/${tripId}/messages/read`, { by });
  }

  async incidents(tripId: string): Promise<ApiResult<readonly IncidentView[]>> {
    return map(
      await this.request<readonly RawIncident[]>('GET', `/v1/trips/${tripId}/incidents`),
      (rows) => rows.map(toIncident),
    );
  }

  async reportIncident(
    tripId: string,
    incident: {
      readonly kind: string;
      readonly at: Date;
      readonly note: string;
      readonly reportedBy: string;
      readonly photoIds: readonly string[];
      readonly lat?: number;
      readonly lon?: number;
    },
  ): Promise<ApiResult<IncidentView>> {
    return map(
      await this.request<RawIncident>('POST', `/v1/trips/${tripId}/incidents`, {
        ...incident,
        at: incident.at.toISOString(),
      }),
      toIncident,
    );
  }

  async resolveIncident(tripId: string, incidentId: string): Promise<ApiResult<null>> {
    return this.request<null>('POST', `/v1/trips/${tripId}/incidents/${incidentId}/resolve`);
  }

  async waypoints(tripId: string): Promise<ApiResult<WaypointsView>> {
    return map(
      await this.request<RawWaypoints>('GET', `/v1/trips/${tripId}/waypoints`),
      toWaypoints,
    );
  }

  async drops(tripId: string): Promise<ApiResult<DropsView>> {
    return map(await this.request<RawDrops>('GET', `/v1/trips/${tripId}/drops`), toDrops);
  }

  async signDrop(tripId: string, dropId: string, at: Date): Promise<ApiResult<DropsView>> {
    return map(
      await this.request<RawDrops>('POST', `/v1/trips/${tripId}/drops/${dropId}/sign`, {
        at: at.toISOString(),
      }),
      toDrops,
    );
  }

  /**
   * The ledger, and what is left of the advance.
   *
   * The advance is a query parameter because the server does not hold one: it
   * lives with the trip's terms and only for trips that have them. The balance
   * comes back **negative** when the driver has spent more than they were
   * given, which is the common case on a long run and the number they actually
   * care about.
   */
  async levies(tripId: string, advanceKobo: number): Promise<ApiResult<LeviesView>> {
    return map(
      await this.request<RawLevies>(
        'GET',
        `/v1/trips/${tripId}/levies?advanceKobo=${Math.round(advanceKobo)}`,
      ),
      toLevies,
    );
  }

  /**
   * Records one payment at a checkpoint.
   *
   * The id is generated by the caller, so a retry from a roadside with one bar
   * of signal is a no-op rather than a second entry in somebody's ledger.
   *
   * Returns the levy, not the ledger: the server answers 201 with the row it
   * wrote, and a caller that wants the new balance reads `levies` again. That
   * is one more request and it is the honest one — the balance depends on an
   * advance this endpoint was never told.
   */
  async recordLevy(
    tripId: string,
    levy: {
      readonly id: string;
      readonly kind: string;
      readonly amountKobo: number;
      readonly at: Date;
      readonly note: string;
      readonly lat?: number;
      readonly lon?: number;
      readonly photoId?: string;
    },
  ): Promise<ApiResult<LevyView>> {
    return map(
      await this.request<RawLevy>('POST', `/v1/trips/${tripId}/levies`, {
        ...levy,
        at: levy.at.toISOString(),
      }),
      toLevy,
    );
  }

  async delivery(tripId: string): Promise<ApiResult<DeliveryView | null>> {
    const result = await this.request<RawDelivery>('GET', `/v1/trips/${tripId}/delivery`);
    // Nothing captured yet is a 404, and it is not an error: a delivery that
    // has not been started is the normal state of every trip until it arrives.
    if (!result.ok && result.failure.kind === 'refused' && result.failure.status === 404) {
      return { ok: true, value: null };
    }
    return map(result, toDelivery);
  }

  async saveDelivery(tripId: string, draft: DeliveryDraft): Promise<ApiResult<DeliveryView>> {
    return map(
      await this.request<RawDelivery>('PUT', `/v1/trips/${tripId}/delivery`, {
        ...draft,
        at: draft.at.toISOString(),
      }),
      toDelivery,
    );
  }

  async sealDelivery(tripId: string): Promise<ApiResult<DeliveryView>> {
    return map(
      await this.request<RawDelivery>('POST', `/v1/trips/${tripId}/delivery/seal`),
      toDelivery,
    );
  }

  /**
   * Every cleaned fix on a trip, with what was dropped and why.
   *
   * `track` is the summary a list draws a chip from; this is what a corridor,
   * a pace chart and the stops are drawn from, and none of them can be
   * reconstructed from five numbers.
   */
  async fixes(tripId: string): Promise<ApiResult<CleanedTrack>> {
    return map(
      await this.request<RawCleanedTrack>('GET', `/v1/tracking/trip/${tripId}/fixes`),
      toCleanedTrack,
    );
  }

  async disputePack(tripId: string): Promise<ApiResult<PackView>> {
    return map(await this.request<RawPack>('GET', `/v1/trips/${tripId}/dispute`), toPack);
  }

  async deviation(tripId: string): Promise<ApiResult<DeviationView>> {
    return this.request<DeviationView>('GET', `/v1/trips/${tripId}/deviation`);
  }

  // --- money on a trip ----------------------------------------------------

  async escrow(tripId: string): Promise<ApiResult<EscrowView>> {
    return this.request<EscrowView>('GET', `/v1/trips/${tripId}/escrow`);
  }

  async cancellation(tripId: string, by: 'shipper' | 'carrier'): Promise<ApiResult<CancellationView>> {
    return this.request<CancellationView>('GET', `/v1/trips/${tripId}/cancellation?by=${by}`);
  }

  async costs(
    tripId: string,
    options: {
      readonly dieselPerLitreKobo: number;
      readonly emptyM?: number;
      readonly otherKobo?: number;
      readonly offeredKobo?: number;
    },
  ): Promise<ApiResult<CostsView>> {
    const query = new URLSearchParams({
      dieselPerLitreKobo: String(options.dieselPerLitreKobo),
    });
    if (options.emptyM !== undefined) query.set('emptyM', String(options.emptyM));
    if (options.otherKobo !== undefined) query.set('otherKobo', String(options.otherKobo));
    if (options.offeredKobo !== undefined) query.set('offeredKobo', String(options.offeredKobo));

    return this.request<CostsView>('GET', `/v1/trips/${tripId}/costs?${query.toString()}`);
  }

  async saveTerms(tripId: string, terms: TermsDraft): Promise<ApiResult<TermsView>> {
    return map(
      await this.request<RawTerms>('PUT', `/v1/trips/${tripId}/terms`, {
        ...terms,
        acceptedAt: terms.acceptedAt.toISOString(),
        driverPaidAt: terms.driverPaidAt?.toISOString() ?? null,
        deliverBy: terms.deliverBy?.toISOString() ?? null,
      }),
      (raw) => ({
        ...raw,
        deliverBy: raw.deliverBy === null ? null : new Date(raw.deliverBy),
      }),
    );
  }

  // --- the person signed in ----------------------------------------------

  /**
   * Register this install for notifications.
   *
   * The offset goes with it because **quiet hours belong to the reader**. The
   * alerts screen can be asked what hour it is; the server's dispatcher runs
   * at three in the morning with nobody to ask, and assuming West Africa Time
   * inside the server is how this breaks the first time somebody ships from
   * Accra.
   */
  async registerDevice(
    token: string,
    platform: 'ios' | 'android',
    utcOffsetMinutes: number,
  ): Promise<ApiResult<null>> {
    return this.request<null>('PUT', '/v1/me/devices', {
      token,
      platform,
      utcOffsetMinutes,
    });
  }

  /** Stop sending to this install. */
  async forgetDevice(token: string): Promise<ApiResult<null>> {
    return this.request<null>('DELETE', `/v1/me/devices/${encodeURIComponent(token)}`);
  }

  async earnings(from: Date, to: Date): Promise<ApiResult<EarningsView>> {
    const query = new URLSearchParams({
      from: from.toISOString(),
      to: to.toISOString(),
    });
    return map(
      await this.request<RawEarnings>('GET', `/v1/me/earnings?${query.toString()}`),
      toEarnings,
    );
  }

  async alerts(localHour: number): Promise<ApiResult<AlertsView>> {
    return map(
      await this.request<RawAlerts>('GET', `/v1/me/alerts?localHour=${localHour}`),
      toAlerts,
    );
  }

  async verification(): Promise<ApiResult<VerificationView>> {
    return this.request<VerificationView>('GET', '/v1/me/verification');
  }

  async recordPaper(paper: string, held: boolean): Promise<ApiResult<VerificationView>> {
    return this.request<VerificationView>('PUT', `/v1/me/verification/${paper}`, { held });
  }

  async vehicles(): Promise<ApiResult<readonly VehicleView[]>> {
    return map(
      await this.request<readonly RawVehicle[]>('GET', '/v1/me/vehicles'),
      (rows) => rows.map(toVehicle),
    );
  }

  async lanes(): Promise<ApiResult<readonly LaneView[]>> {
    return map(await this.request<readonly RawLane[]>('GET', '/v1/me/lanes'), (rows) =>
      rows.map(toLane),
    );
  }

  async saveLane(laneId: string, lane: LaneDraft): Promise<ApiResult<LaneView>> {
    return map(await this.request<RawLane>('PUT', `/v1/me/lanes/${laneId}`, lane), toLane);
  }

  async recordLaneRun(laneId: string, paidKobo: number, at: Date): Promise<ApiResult<LaneView>> {
    return map(
      await this.request<RawLane>('POST', `/v1/me/lanes/${laneId}/runs`, {
        paidKobo,
        at: at.toISOString(),
      }),
      toLane,
    );
  }

  async record(userId: string, side: 'carrier' | 'shipper'): Promise<ApiResult<RecordView>> {
    return this.request<RecordView>('GET', `/v1/people/${userId}/record?side=${side}`);
  }

  async review(
    tripId: string,
    answers: Readonly<Record<string, boolean>>,
    note: string,
  ): Promise<ApiResult<{ readonly id: string; readonly by: string }>> {
    return this.request('PUT', `/v1/trips/${tripId}/review`, { answers, note });
  }

  // --- the load board -----------------------------------------------------

  async loads(options?: {
    readonly lat?: number;
    readonly lon?: number;
    readonly truck?: string;
    readonly baseLat?: number;
    readonly baseLon?: number;
    readonly text?: string;
    readonly minimumOfferKobo?: number;
    /**
     * Only loads from shippers at these standings.
     *
     * Nothing has a standing yet — this product has no shipper ladder — so
     * asking for one comes back with an empty board. That is the truthful
     * answer; the alternative is the whole board wearing a badge nobody
     * earned.
     */
    readonly tiers?: readonly string[];
  }): Promise<ApiResult<readonly RankedLoadView[]>> {
    const { tiers, ...rest } = options ?? {};

    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(rest)) {
      if (value !== undefined && value !== '') query.set(key, String(value));
    }
    // Repeated rather than joined: ASP.NET binds `?tiers=a&tiers=b` to an
    // array and `?tiers=a,b` to one string called "a,b".
    for (const tier of tiers ?? []) query.append('tiers', tier);
    const suffix = query.toString() === '' ? '' : `?${query.toString()}`;

    return map(
      await this.request<readonly RawRankedLoad[]>('GET', `/v1/loads${suffix}`),
      (rows) => rows.map(toRankedLoad),
    );
  }

  /**
   * The caller's own loads, newest first.
   *
   * Not the board. The board is what is still on offer; this is what they
   * posted, awarded ones included — a shipper who could no longer see a load
   * they had posted would have no way to reach the bids on it.
   */
  async myLoads(): Promise<ApiResult<readonly LoadView[]>> {
    return map(await this.request<readonly RawLoad[]>('GET', '/v1/me/loads'), (rows) =>
      rows.map(toLoad),
    );
  }

  async postLoad(loadId: string, load: LoadDraft): Promise<ApiResult<LoadView>> {
    return map(
      await this.request<RawLoad>('PUT', `/v1/loads/${loadId}`, {
        ...load,
        readyBy: load.readyBy.toISOString(),
        expiresAt: load.expiresAt.toISOString(),
      }),
      toLoad,
    );
  }

  async placeBid(
    loadId: string,
    bid: { readonly amountKobo: number; readonly atLat: number; readonly atLon: number },
  ): Promise<ApiResult<BidView>> {
    return map(await this.request<RawBid>('PUT', `/v1/loads/${loadId}/bid`, bid), toBid);
  }

  async bids(loadId: string): Promise<ApiResult<readonly RankedBidView[]>> {
    return map(
      await this.request<readonly RawRankedBid[]>('GET', `/v1/loads/${loadId}/bids`),
      (rows) => rows.map(toRankedBid),
    );
  }

  async acceptBid(loadId: string, bidId: string): Promise<ApiResult<null>> {
    return this.request<null>('POST', `/v1/loads/${loadId}/bids/${bidId}/accept`);
  }

  async chain(loadId: string): Promise<ApiResult<ChainView>> {
    return map(await this.request<RawChain>('GET', `/v1/loads/${loadId}/chain`), toChain);
  }

  async chainRefusals(loadId: string): Promise<ApiResult<readonly ChainRefusalView[]>> {
    return this.request<readonly ChainRefusalView[]>(
      'GET',
      `/v1/loads/${loadId}/chain/refusals`,
    );
  }

  async pairs(truck: string): Promise<ApiResult<readonly PairingView[]>> {
    return map(
      await this.request<readonly RawPairing[]>('GET', `/v1/loads/pairs?truck=${truck}`),
      (rows) => rows.map(toPairing),
    );
  }

  /**
   * Every pair on the board that will *not* share a truck, and why.
   *
   * The mirror of `pairs`. A carrier looking at two loads that nearly fit
   * needs to know which of the five things is wrong, because one of them —
   * a pickup fifty-one kilometres away — they might solve with a phone call.
   */
  async pairRefusals(truck: string): Promise<ApiResult<readonly PairRefusalView[]>> {
    return map(
      await this.request<readonly RawPairRefusal[]>(
        'GET',
        `/v1/loads/pairs/refusals?truck=${truck}`,
      ),
      (rows) => rows.map(toPairRefusal),
    );
  }

  // --- pricing ------------------------------------------------------------

  async quote(truck: string, distanceMetres: number): Promise<ApiResult<QuoteView>> {
    return this.request<QuoteView>(
      'GET',
      `/v1/pricing/quote?truck=${truck}&distanceMetres=${Math.round(distanceMetres)}`,
    );
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
  driverId: string;
  carrierId: string;
  shipperId: string;
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
    driverId: raw.driverId,
    carrierId: raw.carrierId,
    shipperId: raw.shipperId,
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


/*
  What comes back from the routes the screens read.

  Two shapes for each: a `Raw*` with the wire's `string` timestamps, and a
  `*View` with `Date`. The conversion happens in exactly one place per type,
  because a timestamp parsed in two places is a timestamp parsed differently in
  one of them — and every engine downstream takes a `Date`.

  Money stays in kobo and never becomes a float. See ADR-0004.
*/

export interface MessageView {
  readonly id: string;
  readonly from: string;
  readonly body: string;
  /** When it was written, as the device believes. */
  readonly at: Date;
  /** When the server took it. The gap is how a late report is told from a late delivery. */
  readonly receivedAt: Date;
  readonly readBy: readonly string[];
}

interface RawMessage {
  id: string;
  from: string;
  body: string;
  at: string;
  receivedAt: string;
  readBy: string[];
}

function toMessage(raw: RawMessage): MessageView {
  return {
    id: raw.id,
    from: raw.from,
    body: raw.body,
    at: new Date(raw.at),
    receivedAt: new Date(raw.receivedAt),
    readBy: raw.readBy,
  };
}

export interface IncidentView {
  readonly id: string;
  readonly kind: string;
  readonly severity: string;
  readonly at: Date;
  readonly lat: number | null;
  readonly lon: number | null;
  readonly note: string;
  readonly reportedBy: string;
  readonly photoIds: readonly string[];
  readonly resolvedAt: Date | null;
  readonly raisesDispute: boolean;
}

interface RawIncident {
  id: string;
  kind: string;
  severity: string;
  at: string;
  lat: number | null;
  lon: number | null;
  note: string;
  reportedBy: string;
  photoIds: string[];
  resolvedAt: string | null;
  raisesDispute: boolean;
}

function toIncident(raw: RawIncident): IncidentView {
  return {
    ...raw,
    at: new Date(raw.at),
    resolvedAt: raw.resolvedAt === null ? null : new Date(raw.resolvedAt),
  };
}

export interface WaypointView {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly lat: number;
  readonly lon: number;
  readonly radiusM: number;
  readonly sequence: number;
}

export interface VisitView {
  readonly waypointId: string;
  readonly name: string;
  readonly arrived: Date;
  /** Null while the truck is still inside the fence. */
  readonly left: Date | null;
  readonly durationMs: number;
  readonly fixes: number;
}

export interface WaypointsView {
  readonly waypoints: readonly WaypointView[];
  readonly visits: readonly VisitView[];
  /** Origin and destination only — a queue at a checkpoint is nobody's bill. */
  readonly chargeableWaitingMs: number;
}

interface RawWaypoints {
  waypoints: WaypointView[];
  visits: { waypointId: string; name: string; arrived: string; left: string | null; durationMs: number; fixes: number }[];
  chargeableWaitingMs: number;
}

function toWaypoints(raw: RawWaypoints): WaypointsView {
  return {
    waypoints: raw.waypoints,
    visits: raw.visits.map((visit) => ({
      ...visit,
      arrived: new Date(visit.arrived),
      left: visit.left === null ? null : new Date(visit.left),
    })),
    chargeableWaitingMs: raw.chargeableWaitingMs,
  };
}

export interface DropView {
  readonly id: string;
  readonly consignee: string;
  readonly goods: string;
  readonly units: number | null;
  readonly weightKg: number;
  readonly sequence: number;
  readonly deliveredAt: Date | null;
  readonly exception: string | null;
}

export interface DropsView {
  readonly drops: readonly DropView[];
  /** Weight still aboard. What a weighbridge will read. */
  readonly weightAboardKg: number;
  readonly dropFeeKobo: number;
  /** True on the last signature, not on arriving at the last address. */
  readonly complete: boolean;
  readonly outOfOrder: readonly string[];
}

interface RawDrops {
  drops: { id: string; consignee: string; goods: string; units: number | null; weightKg: number; sequence: number; deliveredAt: string | null; exception: string | null }[];
  weightAboardKg: number;
  dropFeeKobo: number;
  complete: boolean;
  outOfOrder: string[];
}

function toDrops(raw: RawDrops): DropsView {
  return {
    ...raw,
    drops: raw.drops.map((drop) => ({
      ...drop,
      deliveredAt: drop.deliveredAt === null ? null : new Date(drop.deliveredAt),
    })),
  };
}

export interface LevyView {
  readonly id: string;
  readonly kind: string;
  readonly amountKobo: number;
  readonly at: Date;
  readonly note: string;
  readonly photoId: string | null;
}

export interface LeviesView {
  readonly levies: readonly LevyView[];
  readonly totalKobo: number;
  /** Negative when the driver is out of pocket, which is the common case. */
  readonly balanceKobo: number;
}

interface RawLevy {
  id: string;
  kind: string;
  amountKobo: number;
  at: string;
  note: string;
  photoId: string | null;
}

function toLevy(raw: RawLevy): LevyView {
  return { ...raw, at: new Date(raw.at) };
}

interface RawLevies {
  levies: RawLevy[];
  totalKobo: number;
  balanceKobo: number;
}

function toLevies(raw: RawLevies): LeviesView {
  return { ...raw, levies: raw.levies.map(toLevy) };
}

export interface DeliveryDraft {
  readonly at: Date;
  readonly photoIds: readonly string[];
  readonly signatureName: string | null;
  readonly signatureRole: string | null;
  readonly signatureImageId: string | null;
  readonly note: string;
  readonly capturedLat?: number;
  readonly capturedLon?: number;
  readonly capturedAccuracy?: number;
  readonly exceptionKind?: string | null;
  readonly exceptionQuantity?: number | null;
  readonly exceptionNote?: string | null;
}

export interface DeliveryView {
  readonly at: Date;
  readonly photoIds: readonly string[];
  readonly signatureName: string | null;
  readonly signatureRole: string | null;
  readonly note: string;
  readonly exceptionKind: string | null;
  readonly exceptionQuantity: number | null;
  readonly exceptionNote: string | null;
  /** Set once, and then nothing else changes. The one-way door. */
  readonly sealedAt: Date | null;
  readonly canSeal: boolean;
  /** The domain's own sentence for what is missing, or null once it can be sealed. */
  readonly missing: string | null;
  readonly capturedNearM: number | null;
  readonly settles: boolean;
}

interface RawDelivery {
  at: string;
  photoIds: string[];
  signatureName: string | null;
  signatureRole: string | null;
  note: string;
  exceptionKind: string | null;
  exceptionQuantity: number | null;
  exceptionNote: string | null;
  sealedAt: string | null;
  canSeal: boolean;
  missing: string | null;
  capturedNearM: number | null;
  settles: boolean;
}

function toDelivery(raw: RawDelivery): DeliveryView {
  return {
    ...raw,
    at: new Date(raw.at),
    sealedAt: raw.sealedAt === null ? null : new Date(raw.sealedAt),
  };
}

export interface EvidenceView {
  readonly kind: string;
  readonly at: Date;
  /** When it stopped happening. A run of fixes is an interval, not an instant. */
  readonly until: Date | null;
  readonly receivedAt: Date | null;
  readonly summary: string;
  readonly source: string;
  readonly weight: string;
}

export interface GapView {
  readonly from: Date;
  readonly to: Date;
  readonly ms: number;
}

export interface PackView {
  readonly tripId: string;
  readonly assembledAt: Date;
  readonly items: readonly EvidenceView[];
  readonly measured: number;
  readonly attested: number;
  readonly lateAttested: number;
  readonly coveredMs: number;
  readonly gaps: readonly GapView[];
  /** Counts and hours, with no adjective anywhere. */
  readonly describe: string;
  readonly thin: boolean;
}

interface RawPack {
  tripId: string;
  assembledAt: string;
  items: { kind: string; at: string; until: string | null; receivedAt: string | null; summary: string; source: string; weight: string }[];
  measured: number;
  attested: number;
  lateAttested: number;
  coveredMs: number;
  gaps: { from: string; to: string; ms: number }[];
  describe: string;
  thin: boolean;
}

function toPack(raw: RawPack): PackView {
  return {
    ...raw,
    assembledAt: new Date(raw.assembledAt),
    items: raw.items.map((item) => ({
      ...item,
      at: new Date(item.at),
      until: item.until === null ? null : new Date(item.until),
      receivedAt: item.receivedAt === null ? null : new Date(item.receivedAt),
    })),
    gaps: raw.gaps.map((gap) => ({ ...gap, from: new Date(gap.from), to: new Date(gap.to) })),
  };
}

interface RawFix {
  lat: number;
  lon: number;
  accuracy: number;
  at: string;
  speed: number | null;
}

interface RawCleanedTrack {
  kept: RawFix[];
  dropped: { fix: RawFix; problem: string }[];
}

function toFix(raw: RawFix): Position {
  return {
    lat: raw.lat,
    lon: raw.lon,
    accuracy: raw.accuracy,
    at: new Date(raw.at),
    ...(raw.speed === null ? {} : { speed: raw.speed }),
  };
}

function toCleanedTrack(raw: RawCleanedTrack): CleanedTrack {
  return {
    kept: raw.kept.map(toFix),
    dropped: raw.dropped.map((entry) => ({
      fix: toFix(entry.fix),
      problem: entry.problem as FixProblem,
    })),
  };
}

export interface DeviationView {
  /** on_course, unknown or deviating. `unknown` is not `on_course`. */
  readonly kind: string;
  readonly detail: string | null;
  readonly furtherM: number | null;
  readonly sinceMs: number | null;
  /** Null when no route was declared, which is different from being on one. */
  readonly offRoute: boolean | null;
  readonly headingFor: string | null;
}

export interface ReleaseView {
  readonly kind: string;
  readonly pct: number;
  readonly condition: string;
  readonly amountKobo: number;
  readonly amountNaira: string;
  readonly met: boolean;
}

export interface EscrowView {
  readonly agreedKobo: number;
  readonly agreedNaira: string;
  readonly releasedKobo: number;
  readonly releasedNaira: string;
  readonly heldBackKobo: number;
  readonly heldBackNaira: string;
  readonly nextKind: string | null;
  readonly nextCondition: string | null;
  readonly releases: readonly ReleaseView[];
}

export interface CancellationView {
  readonly ok: boolean;
  readonly reason: string | null;
  readonly feePct: number | null;
  readonly feeKobo: number | null;
  readonly feeNaira: string | null;
  readonly withinGrace: boolean | null;
  readonly detail: string;
  readonly countsAgainstRecord: boolean;
}

export interface MarginView {
  readonly revenueKobo: number;
  readonly profitKobo: number;
  readonly profitNaira: string;
  readonly fractionPct: number | null;
  readonly take: boolean;
  readonly detail: string;
}

export interface CostsView {
  readonly truck: string;
  readonly ladenM: number;
  readonly emptyM: number;
  readonly litres: number;
  readonly fuelKobo: number;
  readonly runningKobo: number;
  readonly leviesKobo: number;
  readonly otherKobo: number;
  readonly totalKobo: number;
  readonly totalNaira: string;
  readonly walkAwayBelowKobo: number;
  readonly walkAwayBelowNaira: string;
  readonly margin: MarginView | null;
}

export interface TermsDraft {
  readonly truck: string;
  readonly agreedKobo: number;
  readonly acceptedAt: Date;
  readonly distanceM: number;
  readonly driverPayKobo: number;
  readonly driverAdvanceKobo: number;
  readonly driverPaidAt: Date | null;
  /**
   * When the shipper was promised it, or null if nobody said.
   *
   * The only thing a carrier's punctuality is measured against, and the reason
   * this field exists: without it the server counted every delivered trip as
   * on time, which put every carrier at a hundred per cent.
   *
   * Null is a real answer. A trip that is tracked and not traded has no
   * promise on it and counts towards neither side of the figure.
   */
  readonly deliverBy: Date | null;
}

export interface TermsView {
  readonly truck: string;
  readonly agreedKobo: number;
  readonly agreedNaira: string;
  readonly distanceM: number;
  readonly driverPayKobo: number;
  readonly driverAdvanceKobo: number;
  /** When the shipper was promised it, or null if nobody said. */
  readonly deliverBy: Date | null;
}

interface RawTerms {
  truck: string;
  agreedKobo: number;
  agreedNaira: string;
  distanceM: number;
  driverPayKobo: number;
  driverAdvanceKobo: number;
  deliverBy: string | null;
}

export interface UnpaidTripView {
  readonly tripId: string;
  readonly corridor: string;
  readonly deliveredAt: Date;
  readonly payKobo: number;
  readonly payNaira: string;
}

export interface EarningsView {
  readonly from: Date;
  readonly to: Date;
  readonly trips: number;
  readonly distanceM: number;
  readonly earnedKobo: number;
  readonly earnedNaira: string;
  readonly outOfPocketKobo: number;
  readonly outstandingKobo: number;
  readonly outstandingNaira: string;
  readonly settledKobo: number;
  /** Null below three trips: a rate from one run is arithmetic, not information. */
  readonly perKilometreKobo: number | null;
  readonly longestWaitMs: number | null;
  readonly unpaid: readonly UnpaidTripView[];
}

interface RawEarnings {
  from: string;
  to: string;
  trips: number;
  distanceM: number;
  earnedKobo: number;
  earnedNaira: string;
  outOfPocketKobo: number;
  outstandingKobo: number;
  outstandingNaira: string;
  settledKobo: number;
  perKilometreKobo: number | null;
  longestWaitMs: number | null;
  unpaid: { tripId: string; corridor: string; deliveredAt: string; payKobo: number; payNaira: string }[];
}

function toEarnings(raw: RawEarnings): EarningsView {
  return {
    ...raw,
    from: new Date(raw.from),
    to: new Date(raw.to),
    unpaid: raw.unpaid.map((row) => ({ ...row, deliveredAt: new Date(row.deliveredAt) })),
  };
}

export interface AlertView {
  readonly kind: string;
  readonly tripId: string;
  readonly corridor: string;
  readonly at: Date;
  readonly describe: string;
  readonly urgency: string;
  readonly wouldSend: boolean;
  readonly heldBecause: string | null;
}

export interface AlertsView {
  readonly alerts: readonly AlertView[];
  /** One sentence for everything held overnight, or null. */
  readonly digest: string | null;
}

interface RawAlerts {
  alerts: { kind: string; tripId: string; corridor: string; at: string; describe: string; urgency: string; wouldSend: boolean; heldBecause: string | null }[];
  digest: string | null;
}

function toAlerts(raw: RawAlerts): AlertsView {
  return {
    alerts: raw.alerts.map((alert) => ({ ...alert, at: new Date(alert.at) })),
    digest: raw.digest,
  };
}

export interface VerificationView {
  readonly tier: string;
  readonly hasIdentity: boolean;
  readonly hasLicence: boolean;
  readonly hasRegistration: boolean;
  readonly hasInsurance: boolean;
  readonly tripsCompleted: number;
  /** Of those, the ones that had a promised arrival to be judged against. */
  readonly tripsPromised: number;
  readonly tripsOnTime: number;
  readonly incidents: number;
  /** Null below five trips. */
  readonly onTimeRate: number | null;
}

export interface PaperDaysView {
  readonly paper: string;
  /** Days until it expires. Negative when it already has. */
  readonly days: number;
}

export interface VehicleView {
  readonly id: string;
  readonly plate: string;
  readonly truck: string;
  readonly standing: string;
  readonly mayCarry: boolean;
  readonly lapsed: readonly PaperDaysView[];
  readonly expiring: readonly PaperDaysView[];
  readonly missing: readonly string[];
}

type RawVehicle = VehicleView;

function toVehicle(raw: RawVehicle): VehicleView {
  return raw;
}

export interface LaneDraft {
  readonly name: string;
  readonly origin: string;
  readonly destination: string;
  readonly cargo: string;
  readonly weightKg: number;
  readonly truck: string;
  readonly cadence: string;
}

export interface LaneView {
  readonly id: string;
  readonly name: string;
  readonly origin: string;
  readonly destination: string;
  readonly cargo: string;
  readonly weightKg: number;
  readonly truck: string;
  readonly cadence: string;
  readonly describeCadence: string;
  readonly runs: number;
  /** The median of the last six. Null below three runs. */
  readonly typicalKobo: number | null;
  readonly typicalNaira: string | null;
  readonly dueInMs: number | null;
  readonly due: boolean;
  readonly describeDue: string;
}

type RawLane = LaneView;

function toLane(raw: RawLane): LaneView {
  return raw;
}

export interface TallyView {
  readonly claim: string;
  readonly label: string;
  readonly yes: number;
  readonly asked: number;
  /** False below three answers: one bad trip must not read as a pattern. */
  readonly worthShowing: boolean;
}

export interface RecordView {
  readonly reviews: number;
  readonly tallies: readonly TallyView[];
}

export interface LoadView {
  readonly id: string;
  readonly originName: string;
  readonly destinationName: string;
  /**
   * Where it starts and ends.
   *
   * The same coordinates the ranking used. A client that cannot place a load
   * cannot price the haul, draw it, or check the ranking's arithmetic — and
   * "going your way" is a claim about exactly these four numbers.
   */
  readonly originLat: number;
  readonly originLon: number;
  readonly destinationLat: number;
  readonly destinationLon: number;
  readonly cargo: string;
  readonly weightTonnes: number;
  readonly requires: string;
  readonly offeredKobo: number | null;
  readonly offeredNaira: string | null;
  readonly readyBy: Date;
  readonly expiresAt: Date;
  readonly awarded: boolean;
}

interface RawLoad {
  id: string;
  originName: string;
  destinationName: string;
  originLat: number;
  originLon: number;
  destinationLat: number;
  destinationLon: number;
  cargo: string;
  weightTonnes: number;
  requires: string;
  offeredKobo: number | null;
  offeredNaira: string | null;
  readyBy: string;
  expiresAt: string;
  awarded: boolean;
}

function toLoad(raw: RawLoad): LoadView {
  return { ...raw, readyBy: new Date(raw.readyBy), expiresAt: new Date(raw.expiresAt) };
}

export interface LoadDraft {
  readonly originName: string;
  readonly destinationName: string;
  readonly originLat: number;
  readonly originLon: number;
  readonly destinationLat: number;
  readonly destinationLon: number;
  readonly cargo: string;
  readonly weightTonnes: number;
  readonly requires: string;
  readonly offeredKobo: number | null;
  readonly readyBy: Date;
  readonly expiresAt: Date;
}

export interface RankedLoadView {
  readonly load: LoadView;
  readonly scorePct: number;
  /** Non-null when it cannot be taken. Greyed with the reason, never hidden. */
  readonly blocked: string | null;
  readonly deadheadKm: number;
  readonly progressHomeKm: number;
  readonly because: string;
}

interface RawRankedLoad {
  load: RawLoad;
  scorePct: number;
  blocked: string | null;
  deadheadKm: number;
  progressHomeKm: number;
  because: string;
}

function toRankedLoad(raw: RawRankedLoad): RankedLoadView {
  return { ...raw, load: toLoad(raw.load) };
}

export interface BidView {
  readonly id: string;
  readonly amountKobo: number;
  readonly amountNaira: string;
  readonly tripsCompleted: number;
  readonly placedAt: Date;
}

interface RawBid {
  id: string;
  amountKobo: number;
  amountNaira: string;
  tripsCompleted: number;
  placedAt: string;
}

function toBid(raw: RawBid): BidView {
  return { ...raw, placedAt: new Date(raw.placedAt) };
}

export interface RankedBidView {
  readonly bid: BidView;
  readonly scorePct: number;
  /** Null when the carrier has too little history. Unknown, not bad. */
  readonly reliabilityPct: number | null;
  readonly kmToPickup: number;
  readonly because: string;
}

interface RawRankedBid {
  bid: RawBid;
  scorePct: number;
  reliabilityPct: number | null;
  kmToPickup: number;
  because: string;
}

function toRankedBid(raw: RawRankedBid): RankedBidView {
  return { ...raw, bid: toBid(raw.bid) };
}

export interface ChainLegView {
  readonly loadId: string;
  readonly fromName: string;
  readonly toName: string;
  readonly readyFrom: Date;
  readonly deliverBy: Date | null;
  readonly paysKobo: number;
  readonly paysNaira: string;
  readonly distanceKm: number;
}

export interface ChainView {
  readonly legs: readonly ChainLegView[];
  readonly deadheadKm: number;
  readonly ladenKm: number;
  readonly paysKobo: number;
  readonly paysNaira: string;
  /** The number the whole feature exists to move. */
  readonly ladenPct: number;
}

interface RawChain {
  legs: { loadId: string; fromName: string; toName: string; readyFrom: string; deliverBy: string | null; paysKobo: number; paysNaira: string; distanceKm: number }[];
  deadheadKm: number;
  ladenKm: number;
  paysKobo: number;
  paysNaira: string;
  ladenPct: number;
}

function toChain(raw: RawChain): ChainView {
  return {
    ...raw,
    legs: raw.legs.map((leg) => ({
      ...leg,
      readyFrom: new Date(leg.readyFrom),
      deliverBy: leg.deliverBy === null ? null : new Date(leg.deliverBy),
    })),
  };
}

export interface ChainRefusalView {
  readonly loadId: string;
  readonly reason: string;
  readonly detail: string;
}

export interface PairingView {
  readonly a: LoadView;
  readonly b: LoadView;
  readonly fillPct: number;
  readonly paysAKobo: number;
  readonly paysANaira: string;
  readonly paysBKobo: number;
  readonly paysBNaira: string;
  readonly carrierGetsKobo: number;
  readonly carrierGetsNaira: string;
}

interface RawPairing {
  a: RawLoad;
  b: RawLoad;
  fillPct: number;
  paysAKobo: number;
  paysANaira: string;
  paysBKobo: number;
  paysBNaira: string;
  carrierGetsKobo: number;
  carrierGetsNaira: string;
}

function toPairing(raw: RawPairing): PairingView {
  return { ...raw, a: toLoad(raw.a), b: toLoad(raw.b) };
}

/**
 * An indicative range, never a single number.
 *
 * The field names are the server's: `low`, `mid`, `high` in kobo. They are not
 * suffixed `Kobo` the way the money routes are, and that inconsistency is the
 * server's rather than something to paper over here — a client that renamed
 * them would hide it from whoever fixes it.
 *
 * `isIndicative` is always true and travels anyway. A quote that arrives
 * without it is a quote a screen can render as a price, and no estimate in
 * this product is presented as a measurement.
 */
export interface PairRefusalView {
  readonly a: LoadView;
  readonly b: LoadView;
  /** too_heavy, pickups_too_far, drops_too_far, wrong_truck or too_empty. */
  readonly reason: string;
  readonly detail: string;
}

interface RawPairRefusal {
  a: RawLoad;
  b: RawLoad;
  reason: string;
  detail: string;
}

function toPairRefusal(raw: RawPairRefusal): PairRefusalView {
  return { ...raw, a: toLoad(raw.a), b: toLoad(raw.b) };
}

export interface QuoteView {
  readonly low: number;
  readonly mid: number;
  readonly high: number;
  readonly isIndicative: boolean;
  readonly atMinimum: boolean;
  readonly basis: string;
  readonly display: string;
}

/**
 * Transforms a successful result and leaves a failure alone.
 *
 * Exported because screens map server rows into the shapes their engines take,
 * and doing that inside a `.then` means writing the failure branch again at
 * every call site — which is where a failure gets dropped.
 */
export function map<A, B>(result: ApiResult<A>, f: (value: A) => B): ApiResult<B> {
  return result.ok ? { ok: true, value: f(result.value) } : result;
}
