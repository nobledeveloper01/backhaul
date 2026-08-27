import {
  DEFAULT_SHARE_DAYS,
  DEFAULT_SEVERITY,
  canFollow,
  chain,
  distance,
  fromNaira,
  summarise,
  visits,
  type ChainLeg,
  type Delivery,
  type Documents,
  type Incident,
  type Message,
  type Record_,
  type Review,
  type ShareLink,
  type CarrierClaim,
  type ShipperClaim,
  type Visit,
  type Waypoint,
} from '@backhaul/domain';

import type { DemoTrip } from './demo';

/**
 * The rest of the product, in demo form.
 *
 * Same rule as `demo.ts`: **nothing here is a hand-written answer.** Visits are
 * computed by `visits()` from the same tracks the map draws, a chain is built
 * by `chain()` from a pool of loads, and a tier comes out of `tierOf`. What is
 * written by hand is only the input — the documents a carrier uploaded, the
 * messages people typed — because those are facts about the world rather than
 * things the engines derive.
 */

const minutesAgo = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000);
const daysFrom = (now: Date, days: number) => new Date(now.getTime() + days * 86_400_000);

/** Waypoints for a trip, from its own origin and destination. */
export function demoWaypoints(trip: DemoTrip): readonly Waypoint[] {
  const middle = {
    lat: (trip.origin.lat + trip.destination.lat) / 2,
    lon: (trip.origin.lon + trip.destination.lon) / 2,
    accuracy: 0,
    at: trip.origin.at,
  };

  return [
    {
      id: `${trip.id}-origin`,
      name: `${trip.originName} depot`,
      at: trip.origin,
      kind: 'origin',
      // A depot yard, not a gate.
      radius: 400,
    },
    {
      id: `${trip.id}-checkpoint`,
      name: 'Weighbridge',
      at: middle,
      kind: 'checkpoint',
      // A queue that can stretch for a kilometre.
      radius: 1_200,
    },
    {
      id: `${trip.id}-destination`,
      name: `${trip.destinationName} market`,
      at: trip.destination,
      kind: 'destination',
      radius: 500,
    },
  ];
}

export function demoVisits(trip: DemoTrip): readonly Visit[] {
  return visits(trip.track.kept, demoWaypoints(trip));
}

/**
 * Share links for a trip.
 *
 * Three states on purpose — live, expiring, revoked — because the screen that
 * lists them has to render all three and the one that reads worst is the one
 * nobody authored.
 */
export function demoShareLinks(trip: DemoTrip, now: Date): readonly ShareLink[] {
  return [
    {
      token: 'c4f19a7b2e0d4c8fa1b3',
      tripId: trip.id,
      scope: 'position',
      issuedAt: minutesAgo(now, 2600),
      expiresAt: daysFrom(now, DEFAULT_SHARE_DAYS - 2),
      revokedAt: null,
      label: 'Alhaji Bello (receiving)',
    },
    {
      token: '9e2b71c05fa34d6e8b12',
      tripId: trip.id,
      scope: 'evidence',
      issuedAt: minutesAgo(now, 4000),
      expiresAt: daysFrom(now, 1),
      revokedAt: null,
      label: 'Insurance broker',
    },
    {
      token: '77ad30be15c94f21a0d6',
      tripId: trip.id,
      scope: 'position',
      issuedAt: minutesAgo(now, 6000),
      expiresAt: daysFrom(now, 6),
      revokedAt: minutesAgo(now, 300),
      label: 'Market boy',
    },
  ];
}

/** The thread on a trip. One message still queued, because that is the hard one. */
export function demoMessages(trip: DemoTrip, now: Date): readonly Message[] {
  return [
    {
      id: `${trip.id}-m1`,
      tripId: trip.id,
      from: 'shipper',
      body: 'Loaded and sealed. Storekeeper at the other end is Ibrahim, he closes at 6.',
      at: minutesAgo(now, 2610),
      receivedAt: minutesAgo(now, 2610),
      readBy: ['shipper', 'carrier', 'driver'],
    },
    {
      id: `${trip.id}-m2`,
      tripId: trip.id,
      from: 'driver',
      // Written in the coverage gap and delivered eleven hours later. The
      // screen has to say both times or it misrepresents everybody.
      body: 'Weighbridge queue at Jebba. Two hours minimum.',
      at: minutesAgo(now, 2050),
      receivedAt: minutesAgo(now, 1380),
      readBy: ['driver', 'shipper'],
    },
    {
      id: `${trip.id}-m3`,
      tripId: trip.id,
      from: 'carrier',
      body: 'Noted. Musa, call me when you clear it.',
      at: minutesAgo(now, 1370),
      receivedAt: minutesAgo(now, 1370),
      readBy: ['carrier'],
    },
    {
      id: `${trip.id}-m4`,
      tripId: trip.id,
      from: 'driver',
      body: 'Cleared. On the Kaduna road now.',
      at: minutesAgo(now, 40),
      // Not yet acknowledged: shown as pending, never as sent.
      receivedAt: null,
      readBy: ['driver'],
    },
  ];
}

export function demoIncidents(trip: DemoTrip, now: Date): readonly Incident[] {
  return [
    {
      id: `${trip.id}-i1`,
      tripId: trip.id,
      kind: 'detained',
      severity: DEFAULT_SEVERITY.detained,
      at: minutesAgo(now, 2040),
      near: { lat: trip.origin.lat + 1.2, lon: trip.origin.lon + 0.4 },
      note: 'Weighbridge queue, Jebba',
      reportedBy: 'driver',
      photoIds: [],
      resolvedAt: minutesAgo(now, 1375),
    },
  ];
}

/** A carrier's papers and record, for the verification screen. */
export const DEMO_DOCUMENTS: Documents = {
  identity: true,
  licence: true,
  registration: true,
  insurance: false,
};

export const DEMO_RECORD: Record_ = {
  tripsCompleted: 34,
  tripsOnTime: 31,
  incidents: 0,
};

export function demoExpiries(now: Date) {
  return [
    { kind: 'licence' as const, on: daysFrom(now, 18) },
    { kind: 'identity' as const, on: daysFrom(now, 410) },
  ];
}

export function demoCarrierReviews(now: Date): readonly Review<CarrierClaim>[] {
  const answers: readonly Review<CarrierClaim>['answers'][] = [
    { arrived_to_load: true, reachable: true, cargo_intact: true, no_extras: true },
    { arrived_to_load: true, reachable: false, cargo_intact: true, no_extras: true },
    { arrived_to_load: false, reachable: true, cargo_intact: true },
    { arrived_to_load: true, reachable: true, cargo_intact: true, no_extras: false },
    { arrived_to_load: true, cargo_intact: true, no_extras: true },
    { arrived_to_load: true, reachable: true, cargo_intact: true, no_extras: true },
  ];

  return answers.map((given, index) => ({
    tripId: `past-${index}`,
    at: minutesAgo(now, 4_000 * (index + 1)),
    answers: given,
    note: '',
  }));
}

export function demoShipperReviews(now: Date): readonly Review<ShipperClaim>[] {
  const answers: readonly Review<ShipperClaim>['answers'][] = [
    { load_ready: true, as_described: true, paid_on_time: true, receiver_present: true },
    { load_ready: false, as_described: true, paid_on_time: true, receiver_present: true },
    { load_ready: true, as_described: true, paid_on_time: false, receiver_present: true },
    { load_ready: true, as_described: true, paid_on_time: true, receiver_present: false },
  ];

  return answers.map((given, index) => ({
    tripId: `past-s-${index}`,
    at: minutesAgo(now, 5_000 * (index + 1)),
    answers: given,
    note: '',
  }));
}

/**
 * A finished delivery, for the proof screen.
 *
 * Captured 640 m from the market address — inside the tolerance, and near
 * enough to the edge that the document has to say something specific rather
 * than "at the destination" by luck.
 */
export function demoDelivery(trip: DemoTrip, now: Date): Delivery {
  return {
    tripId: trip.id,
    at: minutesAgo(now, 20),
    photoIds: ['load-1', 'gate-1', 'seal-1'],
    signature: { name: 'Ibrahim Sani', role: 'storekeeper', imageId: 'sig-1' },
    capturedAt: {
      lat: trip.destination.lat + 0.0058,
      lon: trip.destination.lon,
      accuracy: 14,
      at: minutesAgo(now, 20),
    },
    note: '',
    exception: { kind: 'short', quantity: 2, note: 'Two bags short on count', photoIds: ['short-1'] },
  };
}

/**
 * A chain proposal for a truck that is about to be empty in Kano.
 *
 * The pool is written by hand; which legs get taken, in what order, and what
 * the chain is worth are all `chain()`'s answers.
 */
export function demoChain(now: Date) {
  const hours = (n: number) => new Date(now.getTime() + n * 3_600_000);
  const at = (lat: number, lon: number) => ({ lat, lon, accuracy: 0, at: now });

  const KANO = at(12.0022, 8.592);
  const KADUNA = at(10.5222, 7.4383);
  const JOS = at(9.8965, 8.8583);
  const LAGOS = at(6.455, 3.3841);
  const ABUJA = at(9.0765, 7.3986);

  const leg = (
    loadId: string,
    from: ReturnType<typeof at>,
    to: ReturnType<typeof at>,
    fromName: string,
    toName: string,
    naira: number,
    readyIn: number,
    dueIn: number,
    cargo: string,
  ): ChainLeg & { readonly cargo: string } => ({
    loadId,
    from,
    to,
    fromName,
    toName,
    readyFrom: hours(readyIn),
    deliverBy: hours(dueIn),
    pays: fromNaira(naira),
    distanceM: distance(from, to),
    cargo,
  });

  const start = leg('current', LAGOS, KANO, 'Lagos', 'Kano', 2_240_000, -44, 2, '28 t cement');

  const pool = [
    leg('kano-kaduna', KANO, KADUNA, 'Kano', 'Kaduna', 760_000, 4, 26, '22 t onions'),
    leg('kano-jos', KANO, JOS, 'Kano', 'Jos', 540_000, 3, 22, '15 t fertiliser'),
    leg('kaduna-lagos', KADUNA, LAGOS, 'Kaduna', 'Lagos', 1_980_000, 28, 70, '26 t sesame'),
    leg('abuja-lagos', ABUJA, LAGOS, 'Abuja', 'Lagos', 1_640_000, 30, 72, '20 t sorghum'),
  ];

  const built = chain(start, pool);
  const cargoOf = new Map([start, ...pool].map((l) => [l.loadId, l.cargo]));

  return {
    built,
    pool,
    start,
    cargoOf,
    /** The legs the engine turned down, and the sentence explaining each. */
    rejected: pool
      .filter((candidate) => !built.legs.some((taken) => taken.loadId === candidate.loadId))
      .map((candidate) => {
        const last = built.legs.at(-1);
        const fit = last === undefined ? null : canFollow(last, candidate);
        return {
          leg: candidate,
          detail: fit === null || fit.ok ? 'Already carrying a load then.' : fit.detail,
        };
      }),
    /** What the same truck would have earned running home empty. */
    aloneValue: summarise([start]),
  };
}
