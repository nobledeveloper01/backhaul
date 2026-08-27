import {
  distanceTravelled,
  eta,
  format,
  fromNaira,
  isLate,
  observe,
  type Bid,
  type Leg,
  type Position,
} from '@backhaul/domain';

import { demoTrips, type DemoTrip } from './demo';

/**
 * The fleet's own view of itself: bids waiting, legs driven, things gone wrong.
 *
 * Built from the same trips the shipper sees, so a figure on the fleet screen
 * and a figure on a trip screen cannot disagree — they are the same track run
 * through the same engines.
 */

const at = (lat: number, lon: number, when: Date): Position => ({
  lat,
  lon,
  accuracy: 20,
  at: when,
});

/**
 * Bids on a posted load.
 *
 * Deliberately awkward: the cheapest bidder is the least proven, and the
 * dearest is a stranger. If the ranking is right it should put neither first,
 * and a screen showing them should let a shipper disagree with it.
 */
export function demoBids(now: Date): { pickup: Position; bids: Bid[] } {
  const KANO = at(12.0022, 8.592, now);

  return {
    pickup: KANO,
    bids: [
      {
        id: 'b1',
        carrierId: 'Sahel Haulage',
        amount: fromNaira(1_780_000),
        tripsCompleted: 6,
        tripsPromised: 6,
        tripsOnTime: 2,
        at: at(11.9, 8.5, now),
        placedAt: new Date(now.getTime() - 40 * 60_000),
      },
      {
        id: 'b2',
        carrierId: 'Kano Freight Co-operative',
        amount: fromNaira(1_940_000),
        tripsCompleted: 41,
        tripsPromised: 41,
        tripsOnTime: 39,
        at: at(12.01, 8.60, now),
        placedAt: new Date(now.getTime() - 25 * 60_000),
      },
      {
        id: 'b3',
        carrierId: 'Adebayo & Sons',
        amount: fromNaira(1_860_000),
        tripsCompleted: 0,
        tripsPromised: 0,
        tripsOnTime: 0,
        at: at(11.7, 8.4, now),
        placedAt: new Date(now.getTime() - 8 * 60_000),
      },
      {
        id: 'b4',
        carrierId: 'Delta Line Logistics',
        amount: fromNaira(2_050_000),
        // Twenty-eight deliveries and not one agreed delivery date. The
        // walkthrough carries this case on purpose: it is what most carriers
        // look like before the marketplace exists, and the board has to say
        // "no punctuality record" rather than "perfectly reliable".
        tripsCompleted: 28,
        tripsPromised: 0,
        tripsOnTime: 0,
        at: at(6.5, 3.4, now),
        placedAt: new Date(now.getTime() - 90 * 60_000),
      },
    ],
  };
}

/**
 * A month of legs, loaded and empty.
 *
 * The empty ones are the point. A fleet that only recorded its paid legs would
 * report 100% utilisation and learn nothing.
 */
export function demoLegs(): Leg[] {
  return [
    { metres: 830_000, loaded: true, earned: fromNaira(2_240_000) },
    { metres: 830_000, loaded: false, earned: fromNaira(0) },
    { metres: 700_000, loaded: true, earned: fromNaira(1_890_000) },
    { metres: 520_000, loaded: false, earned: fromNaira(0) },
    { metres: 480_000, loaded: true, earned: fromNaira(1_300_000) },
    { metres: 120_000, loaded: true, earned: fromNaira(340_000) },
    { metres: 610_000, loaded: false, earned: fromNaira(0) },
    { metres: 900_000, loaded: true, earned: fromNaira(2_430_000) },
  ];
}

export type AlertKind = 'stalled' | 'silent' | 'late' | 'queue';

export interface Alert {
  readonly id: string;
  readonly kind: AlertKind;
  readonly trip: DemoTrip;
  readonly title: string;
  readonly detail: string;
  readonly at: Date;
}

/**
 * What actually needs somebody, derived rather than stored.
 *
 * Every alert here comes from an engine — `observe` for silence and stalls,
 * `isLate` against the ETA range. Nothing is a flag somebody remembered to
 * set, so an alert cannot survive the condition that raised it.
 *
 * Lateness is judged on the **far end** of the ETA range, not the middle: a
 * shipper needs telling while there is still time to do something.
 */
export function demoAlerts(now: Date): Alert[] {
  const out: Alert[] = [];

  for (const trip of demoTrips(now)) {
    const observation = observe(trip.track.kept, now);
    const last = trip.track.kept.at(-1);

    if (observation === 'silent' && last !== undefined) {
      out.push({
        id: `${trip.id}-silent`,
        kind: 'silent',
        trip,
        title: `No signal from ${trip.plate}`,
        // Never blames the driver for the network.
        detail:
          `${trip.originName} → ${trip.destinationName}. This stretch of road ` +
          'often has no coverage.',
        at: last.at,
      });
    }

    if (observation === 'stalled' && last !== undefined) {
      out.push({
        id: `${trip.id}-stalled`,
        kind: 'stalled',
        trip,
        title: `${trip.plate} has not moved`,
        detail: `Stopped away from any scheduled stop on the ${trip.originName} run.`,
        at: last.at,
      });
    }

    const arrival = eta({
      track: trip.track.kept,
      destination: trip.destination,
      now,
      truckClass: trip.truck,
    });

    // A due time the demo gives every trip: 20 hours after it opened.
    const opened = trip.history[0]?.at ?? now;
    const dueBy = new Date(opened.getTime() + 20 * 3_600_000);

    if (isLate(arrival, dueBy) && arrival.kind === 'known') {
      out.push({
        id: `${trip.id}-late`,
        kind: 'late',
        trip,
        title: `${trip.plate} may miss its window`,
        detail:
          `Due by ${stamp(dueBy, now)}; ` +
          (clock(arrival.earliest) === clock(arrival.latest)
            ? `arriving ${stamp(arrival.latest, now)}.`
            : `arriving between ${clock(arrival.earliest)} and ${stamp(arrival.latest, now)}.`),
        at: now,
      });
    }
  }

  // Newest first: the thing that just happened is the thing being looked for.
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** Total distance the demo fleet has actually driven, from its tracks. */
export function drivenSoFar(now: Date): string {
  const metres = demoTrips(now).reduce(
    (total, trip) => total + distanceTravelled(trip.track),
    0,
  );
  return `${Math.round(metres / 1000)} km`;
}

export { format };

/**
 * A time, with the day when the day is not today.
 *
 * "Due by 23:48; arriving between 03:08 and 03:08" was on the fleet screen: a
 * truck arriving five hours *before* its deadline, flagged as late. Both times
 * were right and both were missing the day — the arrival was tomorrow. A bare
 * clock is only unambiguous within one day, and nothing on this corridor is.
 */
function stamp(when: Date, now: Date): string {
  const day = (at: Date) => Math.floor((at.getTime() - now.getTimezoneOffset() * 60_000) / 86_400_000);
  const difference = day(when) - day(now);
  if (difference === 0) return `${clock(when)} today`;
  if (difference === 1) return `${clock(when)} tomorrow`;
  if (difference === -1) return `${clock(when)} yesterday`;
  return `${clock(when)} on ${when.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`;
}

function clock(when: Date): string {
  return when.toLocaleTimeString('en-NG', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
