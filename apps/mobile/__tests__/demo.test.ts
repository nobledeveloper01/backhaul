import {
  clean,
  distanceTravelled,
  eta,
  isSystemRaised,
  observe,
  shouldTrack,
} from '@backhaul/domain';

import { demoTrips } from '../src/state/demo';

const NOW = new Date('2026-08-26T12:00:00.000Z');

/** Stretches where the fixes stopped for longer than the silence threshold. */
function countGaps(fixes: readonly { at: Date }[]): number {
  let gaps = 0;
  for (let i = 1; i < fixes.length; i++) {
    const previous = fixes[i - 1];
    const fix = fixes[i];
    if (previous === undefined || fix === undefined) continue;
    if (fix.at.getTime() - previous.at.getTime() >= 20 * 60_000) gaps++;
  }
  return gaps;
}

describe('the demo dataset', () => {
  test('every trip walks the real state machine', () => {
    // `demoTrips` builds each history through `transition`, so a demo trip
    // cannot sit in a state the machine forbids. If this throws, the dataset
    // is lying about something the product would refuse.
    expect(() => demoTrips(NOW)).not.toThrow();
  });

  test('nothing is a hand-written figure', () => {
    // Every number a screen renders comes from the engines, applied to raw
    // fixes. A dataset with the answers baked in would let a screen look right
    // while the engine behind it was wrong.
    for (const trip of demoTrips(NOW)) {
      expect(clean(trip.raw)).toEqual(trip.track);
    }
  });

  test('the running trip has exactly one coverage gap', () => {
    // Exactly one, not "at least one". The first version asserted
    // `toBeGreaterThan(0)` and passed happily while the dataset's fix cadence
    // was two hours apart — so the corridor view honestly reported *33*
    // stretches with no signal on a trip that has one. The looser assertion
    // was true and useless.
    const [running] = demoTrips(NOW);
    expect(running).toBeDefined();
    if (running === undefined) return;

    expect(countGaps(running.track.kept)).toBe(1);
  });

  test('every other trip has no gaps at all', () => {
    const [, nearlyThere, notStarted] = demoTrips(NOW);
    expect(countGaps(nearlyThere?.track.kept ?? [])).toBe(0);
    expect(countGaps(notStarted?.track.kept ?? [])).toBe(0);
  });

  test('fixes arrive at a cadence the tracking policy would produce', () => {
    // The policy samples every 60–900 seconds. A demo track spaced wider than
    // that is not a demo of this product.
    for (const trip of demoTrips(NOW)) {
      for (let i = 1; i < trip.raw.length; i++) {
        const gap =
          (trip.raw[i]?.at.getTime() ?? 0) - (trip.raw[i - 1]?.at.getTime() ?? 0);
        // One deliberate two-hour outage is allowed; nothing else.
        expect(gap <= 15 * 60_000 || gap >= 60 * 60_000).toBe(true);
      }
    }
  });

  test('one trip has a fix the cleaner throws away, and says so', () => {
    const trips = demoTrips(NOW);
    const withDropped = trips.filter((trip) => trip.track.dropped.length > 0);
    expect(withDropped.length).toBeGreaterThan(0);
    for (const trip of withDropped) {
      // The reason travels with the exclusion — "we dropped some" is not an
      // answer to give a driver disputing their distance.
      for (const dropped of trip.track.dropped) {
        expect(dropped.problem).toBeTruthy();
      }
    }
  });

  test('one trip has not started, and produces no false confidence', () => {
    const notStarted = demoTrips(NOW).find((trip) => trip.raw.length === 0);
    expect(notStarted).toBeDefined();
    if (notStarted === undefined) return;

    expect(distanceTravelled(notStarted.track)).toBe(0);
    expect(observe(notStarted.track.kept, NOW)).toBe('unknown');

    const arrival = eta({
      track: notStarted.track.kept,
      destination: notStarted.destination,
      now: NOW,
      incidents: [],
      truckClass: notStarted.truck,
    });
    // Not a guess dressed as an answer.
    expect(arrival.kind).toBe('unknown');
  });

  test('a loading trip is already recording, and an open one is not', () => {
    const trips = demoTrips(NOW);
    for (const trip of trips) {
      const state = trip.history[trip.history.length - 1]?.state;
      expect(state).toBeDefined();
      if (state === undefined) continue;
      // Capture starts at loading, not at departure: the wait at the depot is
      // what a demurrage claim is made of.
      expect(shouldTrack(state)).toBe(state !== 'open');
    }
  });
});

test('a system-raised state is never attributed to a person', () => {
  // "signal lost · driver" was in a rendered history: a driver reporting the
  // loss of their own signal, which is the thing the tracker detects and the
  // thing they cannot report.
  for (const trip of demoTrips(NOW)) {
    for (const event of trip.history) {
      if (isSystemRaised(event.state)) {
        expect(event.actor).toBe('system');
      } else {
        expect(event.actor).not.toBe('system');
      }
    }
  }
});
