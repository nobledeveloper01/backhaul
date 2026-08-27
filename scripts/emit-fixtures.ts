/**
 * Emits the parity fixtures the .NET server is held to.
 *
 * `packages/domain` is the source of truth for every rule that exists on both
 * sides. This walks those rules, writes inputs and expected outputs to
 * `fixtures/parity.json`, and the C# suite asserts the same answers. Drift
 * fails a test in CI instead of surfacing in a disputed invoice. See ADR-0005.
 *
 * **Regenerating is part of changing a rule.** `make fixtures`, and commit the
 * result. A rule change that skips this step fails the server tests, which is
 * the point rather than an inconvenience.
 */

import { writeFileSync } from 'node:fs';

import {
  TRIP_STATES,
  allowedFrom,
  isSystemRaised,
  isTerminal,
  shouldTrack,
  timeIn,
  transition,
  type TripEvent,
  type TripState,
} from '../packages/domain/src/trip.ts';
import { fromNaira, percent, type Kobo } from '../packages/domain/src/money.ts';
import {
  COMMISSION_PCT,
  FREE_WAITING_MS,
  MINIMUM_FARE,
  RATE_PER_KM,
  demurrage,
  quote,
  settle,
  smallestClassFor,
  type TruckClass,
} from '../packages/domain/src/pricing.ts';
import {
  MAX_PLAUSIBLE_SPEED_MS,
  MAX_USEFUL_ACCURACY_M,
  clean,
  distance,
  distanceTravelled,
  fixQuality,
  type Position,
} from '../packages/domain/src/geo.ts';
import {
  SIGNAL_LOST_AFTER_MS,
  STALLED_AFTER_MS,
  STALL_RADIUS_M,
  observe,
  silentFor,
} from '../packages/domain/src/tracking.ts';
import {
  checkCode,
  formatPhone,
  normalisePhone,
} from '../packages/domain/src/otp.ts';
import {
  MINIMUM_RADIUS_M,
  chargeableWaiting,
  visits,
  type Waypoint,
} from '../packages/domain/src/waypoints.ts';
import {
  DEFAULT_SEVERITY,
  needsPhoto,
  raisesDispute,
  type IncidentKind,
} from '../packages/domain/src/incidents.ts';
import {
  MINIMUM_PHOTOS,
  seal,
  settlesDespite,
  type Delivery,
} from '../packages/domain/src/pod.ts';
import { PER_DROP, dropFee } from '../packages/domain/src/drops.ts';
import {
  EXPIRY_WARNING_DAYS,
  MINIMUM_TRIPS_FOR_RATE,
  onTimeRate,
  tierOf,
  type Documents,
  type Record_,
} from '../packages/domain/src/trust.ts';
import { assess, mayCarry, type Vehicle } from '../packages/domain/src/vehicles.ts';
import {
  IN_TRANSIT_MS,
  RETENTION_DAYS,
  SCHEDULE,
  heldBack,
  nextRelease,
  released,
  schedule,
  sumsTo100,
  type EscrowConditions,
} from '../packages/domain/src/escrow.ts';
import { GRACE_MS, cancel, countsAgainstRecord } from '../packages/domain/src/cancellation.ts';
import {
  EMPTY_FUEL_FRACTION,
  FLOOR_MARGIN,
  advise,
  margin,
  runningCost,
  walkAwayBelow,
  type CostInput,
} from '../packages/domain/src/costs.ts';
import {
  MINIMUM_TRIPS_FOR_PER_KM,
  longestWaitMs,
  perKilometre,
  statement,
  unpaid,
  type Earning,
} from '../packages/domain/src/earnings.ts';

const CLASSES: readonly TruckClass[] = [
  'pickup',
  'canter',
  'truck_15t',
  'trailer_30t',
  'lowbed',
];

/** Real corridors, so a wrong answer is one somebody recognises. */
const CORRIDORS: readonly { name: string; metres: number }[] = [
  { name: 'across town', metres: 12_000 },
  { name: 'Lagos–Ibadan', metres: 120_000 },
  { name: 'Lagos–Abuja', metres: 700_000 },
  { name: 'Lagos–Kano', metres: 830_000 },
];

const T0 = new Date('2026-03-04T06:00:00.000Z');
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);
const iso = (d: Date): string => d.toISOString();

// --- the trip machine ------------------------------------------------------

const transitions = TRIP_STATES.flatMap((from) =>
  allowedFrom(from).map((to) => ({ from, to })),
);

const states = TRIP_STATES.map((state) => ({
  state,
  terminal: isTerminal(state),
  tracks: shouldTrack(state),
  systemRaised: isSystemRaised(state),
}));

/**
 * Refusals, with their exact sentences.
 *
 * The wording is fixture material rather than an implementation detail: these
 * strings are written to be rendered to a driver standing at a loading bay,
 * and two servers giving the same refusal in different words is the sort of
 * difference nobody notices until a support call.
 */
const REFUSAL_CASES: readonly {
  name: string;
  history: readonly [TripState, number][];
  to: TripState;
  atMinutes: number;
}[] = [
  { name: 'first event must be open', history: [], to: 'in_transit', atMinutes: 0 },
  {
    name: 'illegal edge',
    history: [['open', 0], ['assigned', 10], ['loading', 20], ['in_transit', 40]],
    to: 'delivered',
    atMinutes: 60,
  },
  {
    name: 'already delivered',
    history: [
      ['open', 0], ['assigned', 10], ['loading', 20],
      ['in_transit', 40], ['arrived', 600], ['delivered', 640],
    ],
    to: 'disputed',
    atMinutes: 700,
  },
  {
    name: 'back-dated',
    history: [['open', 0], ['assigned', 10], ['loading', 20]],
    to: 'in_transit',
    atMinutes: 15,
  },
  {
    name: 'same instant is allowed',
    history: [['open', 0], ['assigned', 10]],
    to: 'loading',
    atMinutes: 10,
  },
];

function build(steps: readonly [TripState, number][]): TripEvent[] {
  const events: TripEvent[] = [];
  for (const [state, minutes] of steps) {
    const result = transition(events, state, at(minutes), 'driver');
    if (!result.ok) throw new Error(`fixture history is not walkable: ${result.detail}`);
    events.push(result.event);
  }
  return events;
}

const refusals = REFUSAL_CASES.map((testCase) => {
  const history = build(testCase.history);
  const result = transition(history, testCase.to, at(testCase.atMinutes), 'driver');
  return {
    name: testCase.name,
    history: testCase.history.map(([state, minutes]) => ({ state, at: iso(at(minutes)) })),
    to: testCase.to,
    at: iso(at(testCase.atMinutes)),
    ok: result.ok,
    reason: result.ok ? null : result.reason,
    detail: result.ok ? null : result.detail,
  };
});

const TIME_IN_HISTORY: readonly [TripState, number][] = [
  ['open', 0], ['assigned', 10], ['loading', 20], ['in_transit', 60],
  ['signal_lost', 120], ['in_transit', 160], ['signal_lost', 300], ['in_transit', 325],
];
const timeInCases = (['signal_lost', 'in_transit', 'stalled'] as TripState[]).map(
  (state) => ({
    state,
    nowMinutes: 400,
    ms: timeIn(build(TIME_IN_HISTORY), state, at(400)),
  }),
);

// --- pricing ---------------------------------------------------------------

const quotes = CLASSES.flatMap((truck) =>
  CORRIDORS.map(({ name, metres }) => {
    const q = quote(truck, metres);
    return {
      truck,
      corridor: name,
      metres,
      low: q.low,
      mid: q.mid,
      high: q.high,
      atMinimum: q.atMinimum,
    };
  }),
);

const hours = (h: number): number => h * 3_600_000;
const demurrages = CLASSES.flatMap((truck) =>
  [0, hours(4), hours(4) + 1, hours(4.5), hours(10), hours(28)].map((waitedMs) => {
    const d = demurrage(truck, waitedMs);
    return {
      truck,
      waitedMs,
      chargeableHours: d.chargeableHours,
      amount: d.amount,
    };
  }),
);

/** Deliberately awkward figures: the ones that expose a rounding difference. */
const SETTLEMENTS: readonly [number, number, number][] = [
  [4_000_000, 0, 0],
  [4_000_000, 150_000, 1_000_000],
  [3_999_999, 123_457, 1],
  [2_241_000, 60_000, 500_000],
  [1_000_001, 99_999, 0],
  [500_000, 0, 900_000], // an overpaid advance: the balance must go negative
  [0, 0, 0],
];

const settlements = SETTLEMENTS.map(([agreed, dem, advance]) => {
  const s = settle(fromNaira(agreed), fromNaira(dem), fromNaira(advance));
  return {
    agreedNaira: agreed,
    demurrageNaira: dem,
    advanceNaira: advance,
    agreed: s.agreed,
    demurrage: s.demurrage,
    gross: s.gross,
    commission: s.commission,
    advance: s.advance,
    toCarrier: s.toCarrier,
  };
});

/**
 * Rounding half away from zero.
 *
 * Not what `Math.round` does, and not what C#'s default `Math.Round` does
 * either — .NET rounds to even unless `MidpointRounding.AwayFromZero` is asked
 * for. The difference is a kobo, always in the same party's favour, and it is
 * the single most likely place these two implementations quietly diverge.
 */
const roundings = [12_345, -12_345, 50, -50, 149, 151, 1, -1, 6_250, -6_250].map(
  (amount) => ({
    amount,
    pct: COMMISSION_PCT,
    result: percent(amount as Kobo, COMMISSION_PCT),
  }),
);

const classing = [0.5, 1, 1.01, 5, 5.01, 15, 15.01, 30, 40, 40.01, 80].map(
  (weight) => ({ weight, truck: smallestClassFor(weight) }),
);

// --- geography and tracking ------------------------------------------------

const PLACES: Readonly<Record<string, [number, number]>> = {
  lagos: [6.455, 3.3841],
  ibadan: [7.3775, 3.947],
  abuja: [9.0765, 7.3986],
  kano: [12.0022, 8.592],
  maiduguri: [11.8311, 13.151],
};

const distances = Object.keys(PLACES).flatMap((from, i) =>
  Object.keys(PLACES)
    .slice(i + 1)
    .map((to) => ({
      from,
      to,
      metres: distance(fix(from, 0), fix(to, 0)),
    })),
);

function fix(place: string, minutes: number, accuracy = 10): Position {
  const coords = PLACES[place];
  if (coords === undefined) throw new Error(`unknown place: ${place}`);
  return { lat: coords[0], lon: coords[1], accuracy, at: at(minutes) };
}

function raw(lat: number, lon: number, minutes: number, accuracy = 10): Position {
  return { lat, lon, accuracy, at: at(minutes) };
}

const TRACK_CASES: readonly { name: string; fixes: readonly Position[] }[] = [
  { name: 'empty', fixes: [] },
  {
    name: 'clean run',
    fixes: [raw(6.455, 3.3841, 0), raw(6.6, 3.5, 120), raw(7.3775, 3.947, 300)],
  },
  {
    name: 'one tower fix in the middle',
    fixes: [
      raw(6.455, 3.3841, 0),
      raw(6.46, 3.39, 60),
      raw(12.0022, 8.592, 90), // Kano, half an hour later
      raw(6.465, 3.395, 120),
      raw(6.47, 3.4, 180),
    ],
  },
  {
    name: 'half the fixes are useless',
    fixes: [
      raw(6.455, 3.3841, 0),
      raw(6.456, 3.385, 60, 5000),
      raw(6.457, 3.386, 120, 5000),
      raw(6.458, 3.387, 180),
    ],
  },
  {
    name: 'a parked truck does not drift into movement',
    fixes: [raw(6.455, 3.3841, 0, 90), raw(6.4562, 3.3852, 30, 90)],
  },
];

const tracks = TRACK_CASES.map(({ name, fixes }) => {
  const cleaned = clean(fixes);
  return {
    name,
    fixes: fixes.map((f) => ({
      lat: f.lat,
      lon: f.lon,
      accuracy: f.accuracy,
      at: iso(f.at),
    })),
    kept: cleaned.kept.length,
    dropped: cleaned.dropped.map((d) => d.problem),
    quality: fixQuality(cleaned),
    distanceMetres: distanceTravelled(cleaned),
  };
});

const OBSERVE_CASES: readonly {
  name: string;
  fixes: readonly Position[];
  nowMinutes: number;
  atWaypoint?: boolean;
}[] = [
  { name: 'no fixes', fixes: [], nowMinutes: 600 },
  { name: 'one fix', fixes: [raw(6.455, 3.3841, 0)], nowMinutes: 5 },
  {
    name: 'silent',
    fixes: [raw(6.45, 3.38, 0), raw(6.55, 3.48, 10)],
    nowMinutes: 31,
  },
  {
    name: 'a fifteen-minute gap is not an alert',
    fixes: [raw(6.45, 3.38, 0), raw(6.55, 3.48, 10)],
    nowMinutes: 25,
  },
  {
    name: 'short stop',
    fixes: [raw(6.455, 3.3841, 0), raw(6.455, 3.3841, 10), raw(6.455, 3.3841, 20)],
    nowMinutes: 21,
  },
  {
    name: 'an hour parked in the middle of nowhere',
    fixes: [
      raw(6.455, 3.3841, 0), raw(6.455, 3.3841, 20),
      raw(6.455, 3.3841, 40), raw(6.455, 3.3841, 60),
    ],
    nowMinutes: 61,
  },
  {
    name: 'the same hour parked at the depot',
    fixes: [
      raw(6.455, 3.3841, 0), raw(6.455, 3.3841, 20),
      raw(6.455, 3.3841, 40), raw(6.455, 3.3841, 60),
    ],
    nowMinutes: 61,
    atWaypoint: true,
  },
];

const observations = OBSERVE_CASES.map((testCase) => ({
  name: testCase.name,
  fixes: testCase.fixes.map((f) => ({
    lat: f.lat,
    lon: f.lon,
    accuracy: f.accuracy,
    at: iso(f.at),
  })),
  now: iso(at(testCase.nowMinutes)),
  atWaypoint: testCase.atWaypoint ?? false,
  observation: observe(testCase.fixes, at(testCase.nowMinutes), {
    atWaypoint: testCase.atWaypoint ?? false,
  }),
  silentForMs: silentFor(testCase.fixes, at(testCase.nowMinutes)),
}));

// --- write -----------------------------------------------------------------

/**
 * Sign-in.
 *
 * The phone shapes matter because a driver who signs in one way and back
 * another way is two accounts if the two sides normalise differently; the
 * refusal wording matters because a person who reads one sentence in the app
 * and another from the API concludes something is wrong with their account.
 */
const phones = [
  '0803 123 4567',
  '08031234567',
  '+234 803 123 4567',
  '+2348031234567',
  '2348031234567',
  '8031234567',
  '0803-123-4567',
  '0803',
  '+1 415 555 0100',
  '',
].map((written) => ({
  written,
  normalised: normalisePhone(written),
  formatted: normalisePhone(written) === null ? null : formatPhone(normalisePhone(written) as string),
}));

const CODE_NOW = new Date('2026-03-04T09:00:00Z');
const codeMinutes = (n: number) => new Date(CODE_NOW.getTime() + n * 60_000);

const codes = (
  [
    ['good', { attempts: 0, expiresIn: 9, consumed: false }, true],
    ['unknown', null, true],
    ['used', { attempts: 0, expiresIn: 9, consumed: true }, true],
    ['exhausted', { attempts: 5, expiresIn: 9, consumed: false }, false],
    ['burned and expired', { attempts: 5, expiresIn: -1, consumed: false }, true],
    ['expired', { attempts: 0, expiresIn: -1, consumed: false }, true],
    ['wrong, three left', { attempts: 1, expiresIn: 9, consumed: false }, false],
    ['wrong, one left', { attempts: 3, expiresIn: 9, consumed: false }, false],
    ['wrong, last try', { attempts: 4, expiresIn: 9, consumed: false }, false],
  ] as const
).map(([name, state, matches]) => {
  const challenge =
    state === null
      ? undefined
      : {
          phone: '+2348031234567',
          issuedAt: codeMinutes(-1),
          expiresAt: codeMinutes(state.expiresIn),
          attempts: state.attempts,
          consumedAt: state.consumed ? codeMinutes(-1) : null,
        };

  const result = checkCode(challenge, matches, CODE_NOW);

  return {
    name,
    present: state !== null,
    attempts: state?.attempts ?? 0,
    expiresAt: state === null ? null : iso(codeMinutes(state.expiresIn)),
    consumed: state?.consumed ?? false,
    matches,
    now: iso(CODE_NOW),
    ok: result.ok,
    reason: result.ok ? null : result.reason,
    detail: result.ok ? null : result.detail,
  };
});

/**
 * Waypoints, and the arithmetic that decides when demurrage starts.
 *
 * The most financially consequential code in the product after settlement, and
 * the two implementations have to agree on a millisecond: a visit measured to
 * the last fix inside rather than the first outside loses a whole sampling
 * interval of chargeable time, every visit.
 */
const WAY_T0 = new Date('2026-03-04T06:00:00Z');
const wayAt = (minutes: number) => new Date(WAY_T0.getTime() + minutes * 60_000);

const wayFix = (lat: number, lon: number, minutes: number, accuracy = 10): Position => ({
  lat,
  lon,
  accuracy,
  at: wayAt(minutes),
});

const APAPA: Waypoint = {
  id: 'apapa',
  name: 'Apapa depot',
  at: { lat: 6.45, lon: 3.36, accuracy: 0, at: WAY_T0 },
  kind: 'origin',
  radius: 300,
};

const JEBBA: Waypoint = {
  id: 'jebba',
  name: 'Jebba checkpoint',
  at: { lat: 9.13, lon: 4.83, accuracy: 0, at: WAY_T0 },
  kind: 'checkpoint',
  radius: 500,
};

const KANO_W: Waypoint = {
  id: 'kano',
  name: 'Kano market',
  at: { lat: 12.0, lon: 8.52, accuracy: 0, at: WAY_T0 },
  kind: 'destination',
  radius: 300,
};

const sitting = (w: Waypoint, from: number, to: number, every = 15): Position[] => {
  const out: Position[] = [];
  for (let m = from; m <= to; m += every) out.push(wayFix(w.at.lat, w.at.lon, m));
  return out;
};

const waypointCases = (
  [
    [
      'a full trip, three places',
      [
        ...sitting(APAPA, 0, 120),
        wayFix(7.5, 4.0, 240),
        ...sitting(JEBBA, 360, 480),
        wayFix(10.5, 6.5, 540),
        ...sitting(KANO_W, 600, 660),
      ],
    ],
    [
      'left and came back — two visits, not one',
      [
        ...sitting(APAPA, 0, 30),
        wayFix(6.49, 3.36, 45),
        ...sitting(APAPA, 60, 90),
        wayFix(6.49, 3.36, 105),
      ],
    ],
    ['still there when the track ends', sitting(APAPA, 0, 120)],
    ['never arrived anywhere', [wayFix(7.5, 4.0, 0), wayFix(8.0, 4.5, 60)]],
    [
      'an imprecise fix at the gate gets the benefit of the doubt',
      [wayFix(6.4536, 3.36, 0, 150), wayFix(6.4536, 3.36, 15, 150), wayFix(7.5, 4.0, 60)],
    ],
  ] as const
).map(([name, track]) => {
  const route = [APAPA, JEBBA, KANO_W];
  const found = visits(track, route);

  return {
    name,
    fixes: track.map((fix) => ({
      lat: fix.lat,
      lon: fix.lon,
      accuracy: fix.accuracy,
      at: iso(fix.at),
    })),
    visits: found.map((visit) => ({
      waypoint: visit.waypoint.id,
      arrived: iso(visit.arrived),
      left: visit.left === null ? null : iso(visit.left),
      durationMs: visit.durationMs,
      fixes: visit.fixes,
    })),
    chargeableWaitingMs: chargeableWaiting(found),
  };
});

const INCIDENT_KINDS: readonly IncidentKind[] = [
  'breakdown',
  'security',
  'accident',
  'detained',
  'road',
  'cargo',
];

const incidentCases = INCIDENT_KINDS.map((kind) => ({
  kind,
  severity: DEFAULT_SEVERITY[kind],
  raisesDispute: raisesDispute(kind),
  needsPhoto: needsPhoto(kind),
}));

/**
 * Proof of delivery.
 *
 * The wording is the point. A driver standing in a market with a queue behind
 * them, told one thing by the app and another by the server, will conclude the
 * app is broken — and they will be right.
 */
const POD_T0 = new Date('2026-03-06T14:20:00Z');

const podCases = (
  [
    ['complete', 2, { name: 'Ibrahim Sani', role: 'storekeeper' }],
    ['one photograph', 1, { name: 'Ibrahim Sani', role: 'storekeeper' }],
    ['no photographs', 0, { name: 'Ibrahim Sani', role: 'storekeeper' }],
    ['no signature', 2, null],
    ['a signature with no name', 2, { name: '   ', role: 'storekeeper' }],
  ] as const
).map(([name, photos, signature]) => {
  const delivery: Delivery = {
    tripId: 'trip-1',
    at: POD_T0,
    photoIds: Array.from({ length: photos }, (_, i) => `p${i}`),
    signature:
      signature === null
        ? null
        : { name: signature.name, role: signature.role, imageId: 's1' },
    capturedAt: null,
    note: '',
    exception: null,
  };

  const result = seal(delivery);

  return {
    name,
    photos,
    hasSignature: signature !== null,
    signatureName: signature?.name ?? null,
    ok: result.ok,
    reason: result.ok ? null : result.reason,
    detail: result.ok ? null : result.detail,
  };
});

const exceptionCases = (['short', 'damaged', 'refused'] as const).map((kind) => ({
  kind,
  settles: settlesDespite({ kind, quantity: null, note: '', photoIds: [] }),
}));

/** What extra stops add. The first drop is the delivery. */
const dropFeeCases = [0, 1, 2, 3, 4].map((drops) => ({
  drops,
  feeKobo: dropFee(Array.from({ length: drops }, (_, i) => ({
    id: `d${i}`,
    at: {
      id: `w${i}`,
      name: `w${i}`,
      at: { lat: 0, lon: 0, accuracy: 0, at: POD_T0 },
      kind: 'destination' as const,
      radius: 400,
    },
    consignee: '',
    goods: '',
    units: null,
    weightKg: 1_000,
    deliveredAt: null,
    exception: null,
  }))),
}));

/**
 * The trust ladder.
 *
 * A tier decides which loads a carrier may bid on, so an app and a server that
 * disagree about it hand somebody work they cannot legally take — or refuse
 * work they can.
 */
const trustCases = (
  [
    ['nothing at all', [false, false, false, false], [0, 0, 0]],
    ['id and licence only', [true, true, false, false], [0, 0, 0]],
    ['business, just', [true, true, true, false], [5, 4, 0]],
    ['business, one trip short', [true, true, true, false], [4, 4, 0]],
    ['business, on-time too low', [true, true, true, false], [5, 3, 0]],
    ['trusted', [true, true, true, true], [20, 18, 0]],
    ['trusted, one point short', [true, true, true, true], [20, 17, 0]],
    ['trusted with one incident', [true, true, true, true], [20, 19, 1]],
    ['trusted with two', [true, true, true, true], [20, 19, 2]],
    ['floors rather than falling off', [true, true, true, true], [20, 19, 9]],
  ] as const
).map(([name, docs, record]) => {
  const documents: Documents = {
    identity: docs[0],
    licence: docs[1],
    registration: docs[2],
    insurance: docs[3],
  };
  const held: Record_ = {
    tripsCompleted: record[0],
    tripsOnTime: record[1],
    incidents: record[2],
  };

  return {
    name,
    documents,
    record: held,
    tier: tierOf(documents, held),
    onTimeRate: onTimeRate(held),
  };
});

/** A truck's papers, and whether it may take work. */
const VEHICLE_NOW = new Date('2026-03-04T06:00:00Z');
const vehicleDays = (n: number) => new Date(VEHICLE_NOW.getTime() + n * 86_400_000);

const vehicleCases = (
  [
    ['everything in date', { licence: 210, roadworthiness: 96, insurance: 90, permit: 300 }],
    ['insurance expiring', { licence: 210, roadworthiness: 96, insurance: 18, permit: 300 }],
    ['roadworthiness lapsed', { licence: 210, roadworthiness: -9, insurance: 90, permit: 300 }],
    ['no permit at all', { licence: 210, roadworthiness: 96, insurance: 90 }],
    ['lapsed beats missing', { licence: -1, roadworthiness: 5 }],
  ] as const
).map(([name, days]) => {
  // Built in one go rather than mutated: `Vehicle['papers']` is readonly, and
  // the whole point of that is that a set of papers is a fact about a day.
  const papers: Vehicle['papers'] = Object.fromEntries(
    Object.entries(days).map(([paper, offset]) => [paper, vehicleDays(offset)]),
  );

  const vehicle: Vehicle = {
    id: 'v1',
    plate: 'LSR-482-XA',
    truck: 'trailer_30t',
    carrierId: 'c1',
    papers,
    retiredAt: null,
  };

  const assessment = assess(vehicle, VEHICLE_NOW);

  return {
    name,
    days,
    now: iso(VEHICLE_NOW),
    standing: assessment.standing,
    lapsed: assessment.lapsed,
    expiring: assessment.expiring,
    missing: [...assessment.missing].sort(),
    mayCarry: mayCarry(assessment),
  };
});

// --- escrow ----------------------------------------------------------------

/**
 * The release schedule, against trips at every stage.
 *
 * The condition sentences are fixture material for the same reason the trip
 * machine's refusals are: they are rendered to a carrier deciding whether to
 * take the next load, and two servers explaining the same held-back 10% in
 * different words is an argument nobody can settle.
 */
const ESCROW_NOW = new Date('2026-03-20T09:00:00.000Z');
const escrowAgreed = fromNaira(2_240_000);

const escrowCases = (
  [
    ['nothing has happened', { state: 'assigned', movingForMs: 0, podSealed: false, deliveredAt: null, exceptionRaised: false }],
    ['loading started', { state: 'loading', movingForMs: 0, podSealed: false, deliveredAt: null, exceptionRaised: false }],
    ['moving, five hours', { state: 'in_transit', movingForMs: 5 * 3_600_000, podSealed: false, deliveredAt: null, exceptionRaised: false }],
    ['moving, six hours exactly', { state: 'in_transit', movingForMs: IN_TRANSIT_MS, podSealed: false, deliveredAt: null, exceptionRaised: false }],
    ['delivered but not sealed', { state: 'delivered', movingForMs: 20 * 3_600_000, podSealed: false, deliveredAt: new Date('2026-03-19T09:00:00.000Z'), exceptionRaised: false }],
    ['sealed, one day ago', { state: 'delivered', movingForMs: 20 * 3_600_000, podSealed: true, deliveredAt: new Date('2026-03-19T09:00:00.000Z'), exceptionRaised: false }],
    ['sealed, seven days ago', { state: 'delivered', movingForMs: 20 * 3_600_000, podSealed: true, deliveredAt: new Date('2026-03-13T09:00:00.000Z'), exceptionRaised: false }],
    ['seven days but an exception is open', { state: 'delivered', movingForMs: 20 * 3_600_000, podSealed: true, deliveredAt: new Date('2026-03-13T09:00:00.000Z'), exceptionRaised: true }],
  ] as const
).map(([name, raw]) => {
  const conditions: EscrowConditions = raw;
  const releases = schedule(escrowAgreed, conditions, ESCROW_NOW);
  const next = nextRelease(releases);

  return {
    name,
    state: conditions.state,
    movingForMs: conditions.movingForMs,
    podSealed: conditions.podSealed,
    deliveredAt: conditions.deliveredAt === null ? null : iso(conditions.deliveredAt),
    exceptionRaised: conditions.exceptionRaised,
    releases: releases.map((release) => ({
      kind: release.milestone.kind,
      pct: release.milestone.pct,
      amountKobo: release.amount,
      met: release.met,
    })),
    releasedKobo: released(releases),
    heldBackKobo: heldBack(escrowAgreed, releases),
    nextKind: next === null ? null : next.milestone.kind,
    nextCondition: next === null ? null : next.milestone.condition,
  };
});

// --- cancellation ----------------------------------------------------------

const CANCEL_ACCEPTED = new Date('2026-03-20T06:00:00.000Z');
const cancelAgreed = fromNaira(2_240_000);

const cancelCases = (
  [
    ['shipper, inside the grace window', 'shipper', 'assigned', 60],
    ['shipper, after the grace window', 'shipper', 'assigned', 180],
    ['shipper, at the depot', 'shipper', 'loading', 300],
    ['shipper, already on the road', 'shipper', 'in_transit', 900],
    ['carrier, inside the grace window', 'carrier', 'assigned', 60],
    ['carrier, after the grace window', 'carrier', 'assigned', 180],
    ['carrier, at the depot', 'carrier', 'loading', 300],
    ['carrier, already on the road', 'carrier', 'in_transit', 900],
    ['a delivered trip cannot be cancelled', 'shipper', 'delivered', 900],
    ['a cancelled trip cannot be cancelled again', 'carrier', 'cancelled', 900],
  ] as const
).map(([name, by, state, minutes]) => {
  const outcome = cancel({
    by,
    state,
    agreed: cancelAgreed,
    acceptedAt: CANCEL_ACCEPTED,
    now: new Date(CANCEL_ACCEPTED.getTime() + minutes * 60_000),
  });

  return {
    name,
    by,
    state,
    minutesAfterAccepted: minutes,
    ok: outcome.ok,
    reason: outcome.ok ? null : outcome.reason,
    feePct: outcome.ok ? outcome.feePct : null,
    feeKobo: outcome.ok ? outcome.fee : null,
    withinGrace: outcome.ok ? outcome.withinGrace : null,
    detail: outcome.detail,
    countsAgainstRecord: countsAgainstRecord(by, state),
  };
});

// --- what the road costs ---------------------------------------------------

const costCases = (
  [
    ['Lagos–Kano, trailer, loaded both ways', 'trailer_30t', 830_000, 0],
    ['Lagos–Kano, trailer, empty return', 'trailer_30t', 830_000, 830_000],
    ['Lagos–Ibadan, canter', 'canter', 120_000, 40_000],
    ['across town, pickup', 'pickup', 12_000, 6_000],
    ['lowbed, long haul', 'lowbed', 700_000, 350_000],
  ] as const
).map(([name, truck, ladenM, emptyM]) => {
  const input: CostInput = {
    truck,
    ladenM,
    emptyM,
    dieselPerLitre: fromNaira(1_250),
    levies: fromNaira(60_000),
    other: fromNaira(15_000),
  };

  const costs = runningCost(input);
  const floor = walkAwayBelow(input);
  // Three offers around the floor: below it, on it, and comfortably over.
  const offers = [
    Math.round(costs.total * 0.8),
    floor,
    Math.round(floor * 1.4),
  ] as Kobo[];

  return {
    name,
    truck,
    ladenM,
    emptyM,
    dieselPerLitreKobo: input.dieselPerLitre,
    leviesKobo: input.levies,
    otherKobo: input.other,
    litres: costs.litres,
    fuelKobo: costs.fuel,
    runningKobo: costs.running,
    totalKobo: costs.total,
    walkAwayBelowKobo: floor,
    offers: offers.map((offered) => {
      const found = margin(offered, input);
      const opinion = advise(offered, input);
      return {
        offeredKobo: offered,
        profitKobo: found.profit,
        fractionPct: found.fraction === null ? null : Math.round(found.fraction * 1000),
        take: opinion.take,
        detail: opinion.detail,
      };
    }),
  };
});

// --- earnings --------------------------------------------------------------

const EARNINGS_FROM = new Date('2026-03-01T00:00:00.000Z');
const EARNINGS_TO = new Date('2026-03-31T23:59:59.999Z');
const EARNINGS_NOW = new Date('2026-04-02T09:00:00.000Z');

const earningsFor = (n: number): Earning[] =>
  Array.from({ length: n }, (_, i) => ({
    tripId: `t${i + 1}`,
    corridor: 'Lagos–Kano',
    deliveredAt: new Date(EARNINGS_FROM.getTime() + (i + 1) * 86_400_000),
    distanceM: 830_000,
    pay: fromNaira(180_000),
    advance: fromNaira(80_000),
    // Every third trip costs more than the advance covered.
    spent: fromNaira(i % 3 === 0 ? 95_000 : 60_000),
    paidAt: i % 2 === 0 ? new Date(EARNINGS_FROM.getTime() + (i + 5) * 86_400_000) : null,
  }));

const earningsCases = ([0, 1, 2, 3, 7] as const).map((count) => {
  const earnings = earningsFor(count);
  const found = statement(earnings, EARNINGS_FROM, EARNINGS_TO);
  const rate = perKilometre(found);
  const waiting = longestWaitMs(earnings, EARNINGS_NOW);

  return {
    trips: count,
    fromIso: iso(EARNINGS_FROM),
    toIso: iso(EARNINGS_TO),
    countedTrips: found.trips,
    distanceM: found.distanceM,
    earnedKobo: found.earned,
    outOfPocketKobo: found.outOfPocket,
    outstandingKobo: found.outstanding,
    settledKobo: found.settled,
    perKilometreKobo: rate,
    unpaidTripIds: unpaid(earnings).map((earning) => earning.tripId),
    longestWaitMs: waiting,
  };
});

const fixtures = {
  // Bumped whenever the shape changes, so a server built against an older
  // shape fails loudly rather than reading a field that moved.
  version: 1,
  generatedBy: 'scripts/emit-fixtures.ts',
  note:
    'Generated from packages/domain — the source of truth. Do not edit by ' +
    'hand; run `make fixtures`. See ADR-0005.',
  constants: {
    commissionPct: COMMISSION_PCT,
    freeWaitingMs: FREE_WAITING_MS,
    ratePerKm: RATE_PER_KM,
    minimumFare: MINIMUM_FARE,
    maxUsefulAccuracyM: MAX_USEFUL_ACCURACY_M,
    maxPlausibleSpeedMs: MAX_PLAUSIBLE_SPEED_MS,
    signalLostAfterMs: SIGNAL_LOST_AFTER_MS,
    stalledAfterMs: STALLED_AFTER_MS,
    stallRadiusM: STALL_RADIUS_M,
  },
  trip: { states, transitions, refusals, timeInCases },
  pricing: { quotes, demurrages, settlements, roundings, classing },
  tracking: { distances, tracks, observations },
  auth: { phones, codes },
  waypoints: { minimumRadiusM: MINIMUM_RADIUS_M, cases: waypointCases },
  incidents: incidentCases,
  pod: {
    minimumPhotos: MINIMUM_PHOTOS,
    cases: podCases,
    exceptions: exceptionCases,
  },
  drops: { perDropKobo: PER_DROP, fees: dropFeeCases },
  trust: {
    expiryWarningDays: EXPIRY_WARNING_DAYS,
    minimumTripsForRate: MINIMUM_TRIPS_FOR_RATE,
    cases: trustCases,
  },
  vehicles: vehicleCases,
  escrow: {
    retentionDays: RETENTION_DAYS,
    inTransitMs: IN_TRANSIT_MS,
    sumsTo100: sumsTo100(),
    schedule: SCHEDULE.map((milestone) => ({
      kind: milestone.kind,
      pct: milestone.pct,
      condition: milestone.condition,
    })),
    agreedKobo: escrowAgreed,
    nowIso: iso(ESCROW_NOW),
    cases: escrowCases,
  },
  cancellation: {
    graceMs: GRACE_MS,
    agreedKobo: cancelAgreed,
    acceptedAtIso: iso(CANCEL_ACCEPTED),
    cases: cancelCases,
  },
  costs: {
    emptyFuelFraction: EMPTY_FUEL_FRACTION,
    floorMargin: FLOOR_MARGIN,
    cases: costCases,
  },
  earnings: {
    minimumTripsForPerKm: MINIMUM_TRIPS_FOR_PER_KM,
    nowIso: iso(EARNINGS_NOW),
    cases: earningsCases,
  },
};

writeFileSync('fixtures/parity.json', JSON.stringify(fixtures, null, 2) + '\n');

process.stdout.write(
  `fixtures/parity.json — ${
    [
      `${transitions.length} transitions`,
      `${refusals.length} refusals`,
      `${quotes.length} quotes`,
      `${demurrages.length} demurrages`,
      `${settlements.length} settlements`,
      `${roundings.length} roundings`,
      `${classing.length} classings`,
      `${distances.length} distances`,
      `${tracks.length} tracks`,
      `${observations.length} observations`,
      `${phones.length} phones`,
      `${codes.length} codes`,
      `${waypointCases.length} waypoint tracks`,
      `${incidentCases.length} incident kinds`,
      `${podCases.length} deliveries`,
      `${dropFeeCases.length} drop fees`,
      `${trustCases.length} tiers`,
      `${vehicleCases.length} vehicles`,
      `${escrowCases.length} escrow schedules`,
      `${cancelCases.length} cancellations`,
      `${costCases.length} cost models`,
      `${earningsCases.length} statements`,
    ].join(', ')
  }\n`,
);
