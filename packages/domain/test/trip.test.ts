import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  TRIP_STATES,
  allowedFrom,
  canTransition,
  currentState,
  isActive,
  isTerminal,
  shouldTrack,
  timeIn,
  transition,
  type TripEvent,
  type TripState,
} from '../src/trip.ts';

const T0 = new Date('2026-03-04T06:00:00Z');
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);

/** Builds a history by walking the machine, asserting each step is legal. */
function history(...steps: readonly (readonly [TripState, number])[]): TripEvent[] {
  const events: TripEvent[] = [];
  for (const [state, minutes] of steps) {
    const result = transition(events, state, at(minutes), 'driver');
    assert.equal(result.ok, true, `could not reach ${state}`);
    if (result.ok) events.push(result.event);
  }
  return events;
}

describe('the edge set', () => {
  // The machine is data, and this is the assertion that makes it data: adding
  // a transition fails here rather than quietly permitting a new way for
  // cargo to change hands.
  test('is exactly what is written down', () => {
    const edges = TRIP_STATES.flatMap((from) =>
      allowedFrom(from).map((to) => `${from} -> ${to}`),
    ).sort();

    assert.deepEqual(edges, [
      'arrived -> delivered',
      'arrived -> disputed',
      'assigned -> cancelled',
      'assigned -> disputed',
      'assigned -> loading',
      'disputed -> cancelled',
      'disputed -> delivered',
      'in_transit -> arrived',
      'in_transit -> disputed',
      'in_transit -> signal_lost',
      'in_transit -> stalled',
      'loading -> cancelled',
      'loading -> disputed',
      'loading -> in_transit',
      'open -> assigned',
      'open -> cancelled',
      'signal_lost -> arrived',
      'signal_lost -> disputed',
      'signal_lost -> in_transit',
      'signal_lost -> stalled',
      'stalled -> arrived',
      'stalled -> disputed',
      'stalled -> in_transit',
      'stalled -> signal_lost',
    ]);
  });

  test('names no state it cannot reach', () => {
    const reachable = new Set<TripState>(['open']);
    let grew = true;
    while (grew) {
      grew = false;
      for (const from of [...reachable]) {
        for (const to of allowedFrom(from)) {
          if (!reachable.has(to)) {
            reachable.add(to);
            grew = true;
          }
        }
      }
    }
    for (const state of TRIP_STATES) {
      assert.ok(reachable.has(state), `${state} is unreachable from 'open'`);
    }
  });

  test('every non-terminal state can still reach an ending', () => {
    // A state that can be entered but from which no trip can ever finish is a
    // driver who is never paid. Cheap to assert, expensive to discover.
    for (const state of TRIP_STATES) {
      if (isTerminal(state)) continue;
      const seen = new Set<TripState>([state]);
      const queue: TripState[] = [state];
      let ends = false;
      while (queue.length > 0) {
        const here = queue.shift() as TripState;
        if (isTerminal(here)) {
          ends = true;
          break;
        }
        for (const next of allowedFrom(here)) {
          if (!seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      assert.ok(ends, `${state} can never finish`);
    }
  });

  test('delivered and cancelled are the only terminals', () => {
    assert.deepEqual(TRIP_STATES.filter(isTerminal), ['delivered', 'cancelled']);
  });
});

describe('what the machine refuses', () => {
  test('a trip starts open and nothing else', () => {
    assert.equal(transition([], 'open', T0, 'shipper').ok, true);
    for (const state of TRIP_STATES.filter((s) => s !== 'open')) {
      const result = transition([], state, T0, 'shipper');
      assert.equal(result.ok, false, `${state} was accepted as a first state`);
      if (!result.ok) assert.equal(result.reason, 'not_allowed');
    }
  });

  test('a delivered trip cannot be reopened, disputed or anything else', () => {
    // Terminal is terminal. A dispute about a delivered trip is a new record,
    // not an edit of the old one.
    const done = history(
      ['open', 0],
      ['assigned', 10],
      ['loading', 20],
      ['in_transit', 40],
      ['arrived', 600],
      ['delivered', 640],
    );
    for (const state of TRIP_STATES) {
      const result = transition(done, state, at(700), 'shipper');
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, 'terminal');
    }
  });

  test('a back-dated event is rejected, and it is the only hard refusal', () => {
    // The same rule as Grid's back-dated readings, for the same reason: every
    // duration on the trip — transit, stalled, time to delivery — ends up in
    // an invoice or a dispute.
    const moving = history(['open', 0], ['assigned', 10], ['loading', 20]);
    const result = transition(moving, 'in_transit', at(15), 'driver');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'out_of_order');
      assert.match(result.detail, /corrupt every/);
    }
  });

  test('a same-instant event is allowed', () => {
    // Two events in the same second is a phone with a coarse clock, not a
    // corrupted history. Refusing it would strand real trips.
    const moving = history(['open', 0], ['assigned', 10]);
    assert.equal(transition(moving, 'loading', at(10), 'driver').ok, true);
  });

  test('a refusal explains itself in words a driver could read', () => {
    const loading = history(['open', 0], ['assigned', 5], ['loading', 12]);
    const result = transition(loading, 'delivered', at(20), 'driver');
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'not_allowed');
      assert.equal(result.detail, "A trip cannot go from 'loading' to 'delivered'.");
    }
  });

  test('a truck cannot be delivered without arriving or being disputed', () => {
    for (const from of TRIP_STATES) {
      if (canTransition(from, 'delivered')) {
        assert.ok(
          from === 'arrived' || from === 'disputed',
          `${from} can reach delivered directly`,
        );
      }
    }
  });
});

describe('the transit states', () => {
  test('the phone keeps recording through a dead zone', () => {
    // Stopping capture when the network drops loses precisely the stretch of
    // road nobody can account for afterwards.
    assert.equal(shouldTrack('signal_lost'), true);
    assert.deepEqual(TRIP_STATES.filter(shouldTrack), [
      'loading',
      'in_transit',
      'signal_lost',
      'stalled',
    ]);
  });

  test('a trip with no signal is still shown as on the road', () => {
    assert.equal(isActive('signal_lost'), true);
    assert.equal(isActive('open'), false);
    assert.equal(isActive('delivered'), false);
    assert.equal(isActive('cancelled'), false);
  });

  test('signal comes and goes without ending the trip', () => {
    // A Lagos-to-Kano run drops out several times. Each drop must not need a
    // human to un-stick it.
    const trip = history(
      ['open', 0],
      ['assigned', 15],
      ['loading', 30],
      ['in_transit', 90],
      ['signal_lost', 200],
      ['in_transit', 260],
      ['stalled', 300],
      ['in_transit', 340],
      ['signal_lost', 400],
      ['arrived', 900],
    );
    assert.equal(currentState(trip), 'arrived');
    assert.equal(trip.length, 10);
  });
});

describe('durations', () => {
  test('time in a state sums every visit, not just the first', () => {
    // What matters on a dispute is total time unaccounted for, not time since
    // the truck first went quiet.
    const trip = history(
      ['open', 0],
      ['assigned', 10],
      ['loading', 20],
      ['in_transit', 60],
      ['signal_lost', 120], // 40 minutes dark
      ['in_transit', 160],
      ['signal_lost', 300], // 25 more
      ['in_transit', 325],
    );
    assert.equal(timeIn(trip, 'signal_lost', at(400)), 65 * 60_000);
  });

  test('the state it is in right now runs up to the clock', () => {
    const trip = history(['open', 0], ['assigned', 10], ['loading', 20], ['in_transit', 30]);
    assert.equal(timeIn(trip, 'in_transit', at(90)), 60 * 60_000);
  });

  test('a state never entered is zero, not undefined', () => {
    const trip = history(['open', 0], ['assigned', 10]);
    assert.equal(timeIn(trip, 'stalled', at(50)), 0);
  });

  test('a clock that reads before the trip does not produce negative time', () => {
    // Phone clocks go backwards. A negative duration would show up as a
    // credit on an invoice.
    const trip = history(['open', 0], ['assigned', 10], ['loading', 20]);
    assert.equal(timeIn(trip, 'loading', at(5)), 0);
  });
});

describe('the history', () => {
  test('carries who did it and any note, verbatim', () => {
    const opened = transition([], 'open', T0, 'shipper');
    assert.equal(opened.ok, true);
    if (!opened.ok) return;

    const disputed = transition(
      [opened.event, { state: 'assigned', at: at(10), actor: 'carrier' }],
      'disputed',
      at(30),
      'shipper',
      'Truck never showed at the depot.',
    );
    assert.equal(disputed.ok, true);
    if (!disputed.ok) return;
    assert.equal(disputed.event.actor, 'shipper');
    assert.equal(disputed.event.note, 'Truck never showed at the depot.');
  });

  test('omits the note rather than carrying an empty one', () => {
    // exactOptionalPropertyTypes means `note: undefined` and no note are
    // different things, and only one of them round-trips through JSON.
    const opened = transition([], 'open', T0, 'shipper');
    assert.equal(opened.ok, true);
    if (!opened.ok) return;
    assert.equal('note' in opened.event, false);
  });

  test('a dispute resolves both ways, and only through the dispute', () => {
    const stuck = history(
      ['open', 0],
      ['assigned', 10],
      ['loading', 20],
      ['in_transit', 60],
      ['disputed', 300],
    );
    assert.equal(transition(stuck, 'delivered', at(900), 'shipper').ok, true);
    assert.equal(transition(stuck, 'cancelled', at(900), 'shipper').ok, true);
    // Not back onto the road: resolution is a human decision, and a resumed
    // trip is a new trip.
    assert.equal(transition(stuck, 'in_transit', at(900), 'driver').ok, false);
  });

  test('an empty history has no current state, rather than a default one', () => {
    assert.equal(currentState([]), undefined);
  });
});
