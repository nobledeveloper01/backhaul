import {
  DEFAULT_SHARE_DAYS,
  DEFAULT_SEVERITY,
  assemble,
  canFollow,
  chain,
  describeKind,
  distance,
  distanceTravelled,
  fromNaira,
  margin,
  pairs,
  schedule,
  summarise,
  total,
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
  type Drop,
  type Earning,
  type EscrowConditions,
  type Evidence,
  type Lane,
  type Levy,
  type LevyKind,
  type Pack,
  type PairLoad,
  type Position,
  type ShipperClaim,
  type Vehicle,
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
    /**
     * The legs the engine turned down, and why.
     *
     * Tested against **every** leg the chain took, not only the last one. The
     * first version compared each rejected load with the final leg, which put
     * "841 km empty from Lagos to Kano" under a Kano load the truck was
     * standing next to — the right arithmetic asked at the wrong point in the
     * chain, and a carrier would have stopped believing the screen there.
     */
    rejected: pool
      .filter((candidate) => !built.legs.some((taken) => taken.loadId === candidate.loadId))
      .map((candidate) => {
        const fits = built.legs.map((taken) => ({ taken, fit: canFollow(taken, candidate) }));

        const reachable = fits.find((entry) => entry.fit.ok);
        if (reachable !== undefined) {
          return {
            leg: candidate,
            detail: `Another load paid better per kilometre out of ${reachable.taken.toName}.`,
          };
        }

        // Of the refusals, the one from the leg it came closest to following.
        const nearest = [...fits].sort(
          (a, b) =>
            distance(a.taken.to, candidate.from) - distance(b.taken.to, candidate.from),
        )[0];

        return {
          leg: candidate,
          detail: nearest?.fit.ok === false ? nearest.fit.detail : 'Already carrying a load then.',
        };
      }),
    /** What the same truck would have earned running home empty. */
    aloneValue: summarise([start]),
  };
}

// ---------------------------------------------------------------------------
// The second fifteen. Same rule: the engines produce every figure.
// ---------------------------------------------------------------------------

/** Papers for the demo fleet, one truck of each standing worth rendering. */
export function demoVehicles(now: Date): readonly Vehicle[] {
  const on = (days: number) => daysFrom(now, days);

  return [
    {
      id: 'v1',
      plate: 'LSR-482-XA',
      truck: 'trailer_30t',
      carrierId: 'sahel',
      papers: { licence: on(210), roadworthiness: on(96), insurance: on(18), permit: on(300) },
      retiredAt: null,
    },
    {
      id: 'v2',
      plate: 'RVS-119-KJ',
      truck: 'truck_15t',
      carrierId: 'sahel',
      papers: { licence: on(140), roadworthiness: on(-9), insurance: on(120), permit: on(88) },
      retiredAt: null,
    },
    {
      id: 'v3',
      plate: 'KJA-771-BR',
      truck: 'canter',
      carrierId: 'sahel',
      papers: { licence: on(260), roadworthiness: on(150), insurance: on(200) },
      retiredAt: null,
    },
    {
      id: 'v4',
      plate: 'ABC-004-LA',
      truck: 'trailer_30t',
      carrierId: 'sahel',
      papers: { licence: on(400), roadworthiness: on(380), insurance: on(370), permit: on(390) },
      retiredAt: null,
    },
  ];
}

/** What the road took on the running trip. */
export function demoLevies(trip: DemoTrip, now: Date): readonly Levy[] {
  const entries: readonly [LevyKind, number, number, string][] = [
    ['union', 12_000, 2_540, 'Loading park, Apapa'],
    ['police', 2_000, 2_180, ''],
    ['state_revenue', 7_500, 1_950, 'Ogun state'],
    ['police', 1_500, 1_640, ''],
    ['weighbridge', 5_000, 1_380, 'Ibadan'],
    ['police', 2_000, 900, ''],
    ['union', 8_000, 420, 'Kaduna park'],
    ['police', 3_000, 120, ''],
  ];

  return entries.map(([kind, naira, minutes, note], index) => ({
    id: `${trip.id}-levy-${index}`,
    tripId: trip.id,
    kind,
    amount: fromNaira(naira),
    at: minutesAgo(now, minutes),
    near: null,
    note,
    photoId: null,
  }));
}

/** Where the money is on the running trip. */
export function demoEscrow(trip: DemoTrip, now: Date) {
  const conditions: EscrowConditions = {
    state: trip.history.at(-1)?.state ?? 'open',
    movingForMs: 20 * 60 * 60_000,
    podSealed: false,
    deliveredAt: null,
    exceptionRaised: false,
  };

  return schedule(fromNaira(trip.agreedNaira), conditions, now);
}

/** What the carrier clears on it, at today's diesel. */
export function demoMargin(trip: DemoTrip, now: Date) {
  const laden = distanceTravelled(trip.track);
  return margin(fromNaira(trip.agreedNaira), {
    truck: trip.truck,
    ladenM: laden,
    // Home again empty, which is the whole reason `chaining.ts` exists.
    emptyM: laden,
    dieselPerLitre: fromNaira(1_100),
    levies: total(demoLevies(trip, now)),
    other: fromNaira(20_000),
  });
}

/** Drops for a multi-drop trip. */
export function demoDrops(trip: DemoTrip, now: Date): readonly Drop[] {
  const place = (id: string, name: string, lat: number, lon: number): Waypoint => ({
    id,
    name,
    at: { lat, lon, accuracy: 0, at: trip.origin.at },
    kind: 'destination',
    radius: 400,
  });

  return [
    {
      id: 'd1',
      at: place('d1-w', 'Dawanau market', 12.05, 8.45),
      consignee: 'Alhaji Bello & Sons',
      goods: '10 t cement',
      units: 200,
      weightKg: 10_000,
      deliveredAt: minutesAgo(now, 90),
      exception: null,
    },
    {
      id: 'd2',
      at: place('d2-w', 'Sabon Gari depot', 12.01, 8.53),
      consignee: 'Kano Builders',
      goods: '12 t cement',
      units: 240,
      weightKg: 12_000,
      deliveredAt: null,
      exception: null,
    },
    {
      id: 'd3',
      at: place('d3-w', 'Bompai yard', 11.99, 8.56),
      consignee: 'Northern Blocks',
      goods: '6 t cement',
      units: 120,
      weightKg: 6_000,
      deliveredAt: null,
      exception: null,
    },
  ];
}

/** "4 h 20" — for a summary line, not for a duration a person is waiting out. */
function humanHours(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
}

/** The evidence on a trip, assembled by the real engine. */
export function demoDispute(trip: DemoTrip, now: Date): Pack {
  const evidence: Evidence[] = [];

  for (const event of trip.history) {
    evidence.push({
      kind: 'trip_event',
      at: event.at,
      receivedAt: event.at,
      summary: `Trip moved to ${event.state.replace(/_/g, ' ')}`,
      source: event.actor === 'system' ? 'system' : event.actor,
    });
  }

  /*
    Runs of coverage, not individual fixes.

    A pack listing nine hundred identical lines is useless to a human — and the
    first version, which sampled every twentieth fix, was worse than useless:
    it invented nine gaps totalling fifty-one hours on a trip whose coverage
    was continuous apart from one two-hour stretch. The pack said the opposite
    of what the record held.

    A run is an interval, and `Evidence.until` is what lets the gap finder know
    that.
  */
  const CONTINUOUS_MS = 30 * 60_000;
  let runFrom: Position | null = null;
  let runTo: Position | null = null;
  let runFixes = 0;

  const closeRun = () => {
    if (runFrom === null || runTo === null) return;
    evidence.push({
      kind: 'position',
      at: runFrom.at,
      until: runTo.at,
      receivedAt: null,
      summary:
        runFixes === 1
          ? 'One position recorded'
          : `${runFixes} positions recorded, ${humanHours(
              runTo.at.getTime() - runFrom.at.getTime(),
            )} of continuous coverage`,
      source: 'system',
    });
    runFrom = null;
    runTo = null;
    runFixes = 0;
  };

  for (const fix of trip.track.kept) {
    if (runTo !== null && fix.at.getTime() - runTo.at.getTime() > CONTINUOUS_MS) {
      closeRun();
    }
    if (runFrom === null) runFrom = fix;
    runTo = fix;
    runFixes++;
  }
  closeRun();

  for (const dropped of trip.track.dropped) {
    evidence.push({
      kind: 'discarded_position',
      at: dropped.fix.at,
      receivedAt: null,
      summary: `Position discarded — ${dropped.problem.replace(/_/g, ' ')}`,
      source: 'system',
    });
  }

  for (const message of demoMessages(trip, now)) {
    evidence.push({
      kind: 'message',
      at: message.at,
      receivedAt: message.receivedAt,
      summary: `${message.from}: ${message.body}`,
      source: message.from,
    });
  }

  for (const incident of demoIncidents(trip, now)) {
    evidence.push({
      kind: 'incident',
      at: incident.at,
      receivedAt: incident.at,
      summary: `${describeKind(incident.kind)} — ${incident.note}`,
      source: incident.reportedBy,
    });
  }

  for (const visit of demoVisits(trip)) {
    evidence.push({
      kind: 'waypoint_visit',
      at: visit.arrived,
      receivedAt: null,
      summary: `Arrived at ${visit.waypoint.name}`,
      source: 'system',
    });
  }

  return assemble(trip.id, evidence, now);
}

/** A driver's last few months. */
export function demoEarnings(now: Date): readonly Earning[] {
  const runs: readonly [string, number, number, number, number, boolean][] = [
    ['Lagos → Kano', 3, 1_000, 120_000, 50_000, false],
    ['Kano → Kaduna', 9, 240, 34_000, 20_000, true],
    ['Kaduna → Lagos', 14, 760, 96_000, 40_000, true],
    ['Lagos → Onitsha', 22, 460, 62_000, 30_000, true],
    ['Onitsha → Lagos', 27, 460, 58_000, 25_000, true],
    ['Lagos → Ibadan', 34, 130, 22_000, 10_000, true],
    ['Lagos → Kano', 41, 1_000, 118_000, 50_000, false],
  ];

  return runs.map(([corridor, daysBack, km, pay, advance, paid], index) => ({
    tripId: `past-${index}`,
    corridor,
    deliveredAt: minutesAgo(now, daysBack * 24 * 60),
    distanceM: km * 1_000,
    pay: fromNaira(pay),
    advance: fromNaira(advance),
    // Roughly what the checkpoint ledger records, and sometimes more than the
    // advance — which is the case the statement exists to make visible.
    spent: fromNaira(Math.round(advance * (index % 3 === 0 ? 1.25 : 0.8))),
    paidAt: paid ? minutesAgo(now, (daysBack - 2) * 24 * 60) : null,
  }));
}

/** A shipper's saved lanes. */
export function demoLanes(now: Date): readonly Lane[] {
  return [
    {
      id: 'lane-1',
      shipperId: 's1',
      name: 'Tuesday cement',
      origin: 'Lagos',
      destination: 'Kano',
      cargo: '28 t cement',
      weightKg: 28_000,
      truck: 'trailer_30t',
      cadence: 'weekly',
      history: [2_180_000, 2_240_000, 2_200_000, 2_260_000, 2_220_000].map(fromNaira),
      lastRunAt: minutesAgo(now, 6 * 24 * 60),
    },
    {
      id: 'lane-2',
      shipperId: 's1',
      name: 'Rice to Abuja',
      origin: 'Port Harcourt',
      destination: 'Abuja',
      cargo: '14 t bagged rice',
      weightKg: 14_000,
      truck: 'truck_15t',
      cadence: 'fortnightly',
      history: [860_000, 900_000, 880_000].map(fromNaira),
      lastRunAt: minutesAgo(now, 19 * 24 * 60),
    },
    {
      id: 'lane-3',
      shipperId: 's1',
      name: 'Machine parts, when needed',
      origin: 'Lagos',
      destination: 'Ibadan',
      cargo: '4 t machine parts',
      weightKg: 4_000,
      truck: 'canter',
      cadence: 'ad_hoc',
      history: [160_000, 165_000].map(fromNaira),
      lastRunAt: minutesAgo(now, 40 * 24 * 60),
    },
  ];
}

/** Part-loads a trailer could take together. */
export function demoPairs(now: Date) {
  const at = (lat: number, lon: number) => ({ lat, lon });

  const load = (
    id: string,
    cargo: string,
    weightKg: number,
    naira: number,
    origin: string,
    destination: string,
    from: { lat: number; lon: number },
    to: { lat: number; lon: number },
  ): PairLoad => ({
    id,
    origin,
    destination,
    cargo,
    weightKg,
    offered: fromNaira(naira),
    readyFrom: now,
    truckClass: 'trailer_30t',
    shipperTier: 'business',
    origin_: from,
    destination_: to,
  });

  const board = [
    load('onions', '14 t onions', 14_000, 1_180_000, 'Kano', 'Lagos', at(12.0022, 8.592), at(6.455, 3.3841)),
    load('sesame', '13 t sesame', 13_000, 1_240_000, 'Kano', 'Lagos', at(11.98, 8.62), at(6.52, 3.36)),
    load('hides', '8 t hides', 8_000, 640_000, 'Kano', 'Ibadan', at(12.01, 8.55), at(7.3775, 3.947)),
    load('millet', '19 t millet', 19_000, 1_520_000, 'Kano', 'Lagos', at(12.03, 8.51), at(6.46, 3.4)),
  ];

  return { board, found: pairs(board, 'trailer_30t') };
}
