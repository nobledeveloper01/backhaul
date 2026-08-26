/**
 * The trip state machine.
 *
 * A trip is the spine of the product: it decides whether a driver is paid,
 * whether a cargo owner's goods are accounted for, and what a dispute is
 * argued against. So the machine is written as **data, not control flow** —
 * an explicit edge set that tests assert exactly, so adding a transition
 * fails the build rather than quietly permitting a new way for cargo to
 * change hands.
 *
 * A state added with no outgoing edges is terminal by default. That is the
 * safe direction to fail: a stuck trip gets noticed by a human within hours,
 * while a wrongly-mobile one could mark undelivered goods as delivered.
 */

export const TRIP_STATES = [
  /** Posted by a cargo owner, open for bids. */
  'open',
  /** A bid was accepted; the truck has not started. */
  'assigned',
  /** Loading at origin. */
  'loading',
  /** Moving. The state the tracking engine cares about. */
  'in_transit',
  /** Positions have stopped arriving for longer than the policy allows. */
  'signal_lost',
  /** Stopped somewhere it was not expected to stop, for too long. */
  'stalled',
  /** Arrived at destination, not yet unloaded or signed for. */
  'arrived',
  /** Proof of delivery captured. Terminal. */
  'delivered',
  /** Something went wrong and a human is looking at it. */
  'disputed',
  /** Ended before delivery, by either party. Terminal. */
  'cancelled',
] as const;

export type TripState = (typeof TRIP_STATES)[number];

/**
 * The complete edge set.
 *
 * Written out rather than derived. A derived machine is shorter and hides the
 * one thing anyone reviewing this needs to see: exactly which transitions are
 * possible.
 */
const ALLOWED: Readonly<Record<TripState, readonly TripState[]>> = {
  open: ['assigned', 'cancelled'],
  assigned: ['loading', 'cancelled', 'disputed'],
  loading: ['in_transit', 'cancelled', 'disputed'],

  // The three transit states move freely between one another, because the
  // conditions that distinguish them — signal, movement — come and go on a
  // Lagos-to-Kano corridor several times a trip.
  in_transit: ['signal_lost', 'stalled', 'arrived', 'disputed'],
  signal_lost: ['in_transit', 'stalled', 'arrived', 'disputed'],
  stalled: ['in_transit', 'signal_lost', 'arrived', 'disputed'],

  arrived: ['delivered', 'disputed'],

  // A dispute can resolve either way, and it is the only path back out of one.
  // Resolution is a human decision recorded through this edge, never an
  // inference from the tracking data — the whole reason a trip is disputed is
  // that the data is being argued about.
  disputed: ['delivered', 'cancelled'],

  delivered: [],
  cancelled: [],
} as const;

export function allowedFrom(state: TripState): readonly TripState[] {
  return ALLOWED[state];
}

export function canTransition(from: TripState, to: TripState): boolean {
  return ALLOWED[from].includes(to);
}

export function isTerminal(state: TripState): boolean {
  return ALLOWED[state].length === 0;
}

/**
 * States in which the tracking engine should be capturing positions.
 *
 * `signal_lost` is included on purpose: the phone keeps sampling and queueing
 * to SQLite even when nothing can be uploaded. Stopping capture the moment
 * the network drops would lose precisely the stretch of road nobody can
 * account for afterwards.
 */
export function shouldTrack(state: TripState): boolean {
  return (
    state === 'loading' ||
    state === 'in_transit' ||
    state === 'signal_lost' ||
    state === 'stalled'
  );
}

/**
 * The states a cargo owner is shown as "on the road".
 *
 * `signal_lost` counts. A shipper watching a truck cross a dead zone should
 * see "no signal since 14:20", not a trip that has silently left the list.
 */
export function isActive(state: TripState): boolean {
  return !isTerminal(state) && state !== 'open';
}

/**
 * Every state that has ever been reached, in order. **Append-only.**
 *
 * A trip's history is evidence in exactly the way Grid's readings are: it is
 * what a delivery dispute is argued against. There is no edit path, and a
 * correction is a new entry.
 */
export interface TripEvent {
  readonly state: TripState;
  readonly at: Date;
  /** Who or what caused it. */
  readonly actor: 'shipper' | 'carrier' | 'driver' | 'system';
  /** Free text, shown verbatim in a dispute pack. */
  readonly note?: string;
}

export type TransitionResult =
  | { readonly ok: true; readonly event: TripEvent }
  | { readonly ok: false; readonly reason: TransitionRefusal; readonly detail: string };

export type TransitionRefusal =
  /** The edge does not exist. */
  | 'not_allowed'
  /** The trip is already finished. */
  | 'terminal'
  /** The event is dated before the one preceding it. */
  | 'out_of_order';

/**
 * Applies a transition, or explains why not.
 *
 * Returns a result rather than throwing. Every caller here is a UI that has to
 * say something useful to a driver standing at a loading bay, and an exception
 * is not something you can render.
 */
export function transition(
  history: readonly TripEvent[],
  to: TripState,
  at: Date,
  actor: TripEvent['actor'],
  note?: string,
): TransitionResult {
  const current = history.at(-1);

  if (current === undefined) {
    return to === 'open'
      ? { ok: true, event: note === undefined ? { state: to, at, actor } : { state: to, at, actor, note } }
      : {
          ok: false,
          reason: 'not_allowed',
          detail: `A trip starts as 'open', not '${to}'.`,
        };
  }

  if (isTerminal(current.state)) {
    return {
      ok: false,
      reason: 'terminal',
      detail: `This trip is already ${current.state} and cannot change again.`,
    };
  }

  // The one hard refusal, and it mirrors Grid's rule about back-dated
  // readings: an event dated before the one preceding it corrupts every
  // duration derived from the history — time in transit, time stalled, time
  // to delivery — all of which end up in an invoice or a dispute.
  if (at.getTime() < current.at.getTime()) {
    return {
      ok: false,
      reason: 'out_of_order',
      detail:
        `That is dated before the trip's last event ` +
        `(${current.at.toISOString()}), and accepting it would corrupt every ` +
        `duration on the trip.`,
    };
  }

  if (!canTransition(current.state, to)) {
    return {
      ok: false,
      reason: 'not_allowed',
      detail: `A trip cannot go from '${current.state}' to '${to}'.`,
    };
  }

  return {
    ok: true,
    event: note === undefined ? { state: to, at, actor } : { state: to, at, actor, note },
  };
}

export function currentState(history: readonly TripEvent[]): TripState | undefined {
  return history.at(-1)?.state;
}

/**
 * How long the trip has spent in a given state, across every visit to it.
 *
 * Summed across visits rather than measured from the first entry, because a
 * truck on this corridor enters and leaves `signal_lost` repeatedly and the
 * figure that matters is total time unaccounted for, not time since it first
 * went quiet.
 */
export function timeIn(
  history: readonly TripEvent[],
  state: TripState,
  now: Date,
): number {
  let total = 0;
  for (let i = 0; i < history.length; i++) {
    const event = history[i];
    if (event === undefined || event.state !== state) continue;
    const next = history[i + 1];
    const end = next?.at ?? now;
    total += Math.max(0, end.getTime() - event.at.getTime());
  }
  return total;
}
