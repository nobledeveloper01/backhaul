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
import { fromNaira, percent, ZERO, type Kobo } from '../packages/domain/src/money.ts';
import {
  MINIMUM_LEGS,
  describeRate,
  describeRatio,
  utilisation,
  worthOfOneReturnLeg,
  type Leg,
} from '../packages/domain/src/utilisation.ts';
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
  LADDER,
  meets,
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
  describeTripFilter,
  filterLoads,
  filterTrips,
  isFiltering,
  whyNothing,
  type LoadFilter,
  type LoadSummary,
  type TripFilter,
  type TripSummary,
} from '../packages/domain/src/search.ts';
import {
  POLICY,
  QUIET_FROM_HOUR,
  QUIET_TO_HOUR,
  decideAlert,
  describeAlert,
  digest,
  isQuietHour,
  type AlertKind,
  type Audience,
} from '../packages/domain/src/alerts.ts';
import {
  DUE_WARNING_MS,
  MINIMUM_RUNS_FOR_TYPICAL,
  RECENT_RUNS,
  UNUSUAL_FRACTION,
  describeCadence,
  describeDue,
  dueIn,
  isDue,
  isUnusual,
  typicalPrice,
  type Cadence,
  type Lane,
} from '../packages/domain/src/lanes.ts';
import {
  CARRIER_CLAIMS,
  MINIMUM_ANSWERS,
  REVIEW_WINDOW_DAYS,
  SHIPPER_CLAIMS,
  labelCarrier,
  labelShipper,
  reviewable,
  tally,
  worthShowing,
  type CarrierClaim,
  type Review,
} from '../packages/domain/src/ratings.ts';
import {
  DEVIATION_M,
  DEVIATION_WINDOW_MS,
  deviation,
} from '../packages/domain/src/deviation.ts';
import {
  GAP_MS,
  LATE_AFTER_MS,
  MINIMUM_COVERED_MS,
  assemble,
  describePack,
  isThin,
  type Evidence,
} from '../packages/domain/src/dispute.ts';
import {
  CONNECTION_SLACK_MS,
  MAX_CHAIN_LEGS,
  MAX_REPOSITION_M,
  REPOSITION_SPEED_MS,
  canFollow,
  chain,
  ladenFraction,
  type ChainLeg,
} from '../packages/domain/src/chaining.ts';
import {
  DROP_SPREAD_M,
  MINIMUM_FILL,
  PICKUP_SPREAD_M,
  SHIPPER_DISCOUNT_PCT,
  canShare,
  pairs,
  type PairLoad,
} from '../packages/domain/src/consolidation.ts';
import {
  MAX_DEADHEAD_M,
  MINIMUM_TRIPS_FOR_RELIABILITY,
  PREMIUM_TOLERANCE,
  rankBids,
  rankLoads,
  type Bid,
  type Carrier,
  type Load,
} from '../packages/domain/src/matching.ts';
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
    // completed, promised, on time, incidents
    ['nothing at all', [false, false, false, false], [0, 0, 0, 0]],
    ['id and licence only', [true, true, false, false], [0, 0, 0, 0]],
    ['business, just', [true, true, true, false], [5, 5, 4, 0]],
    ['business, one trip short', [true, true, true, false], [4, 4, 4, 0]],
    ['business, on-time too low', [true, true, true, false], [5, 5, 3, 0]],
    ['trusted', [true, true, true, true], [20, 20, 18, 0]],
    ['trusted, one point short', [true, true, true, true], [20, 20, 17, 0]],
    ['trusted with one incident', [true, true, true, true], [20, 20, 19, 1]],
    ['trusted with two', [true, true, true, true], [20, 20, 19, 2]],
    ['floors rather than falling off', [true, true, true, true], [20, 20, 19, 9]],
    // The three that the promised/completed split exists for. A carrier whose
    // trips were tracked and never traded has no punctuality record, which is
    // neither a good one nor a bad one.
    ['every paper, no deadline ever set', [true, true, true, true], [20, 0, 0, 0]],
    ['one promise kept is not a record', [true, true, true, true], [20, 1, 1, 0]],
    ['five promises kept is', [true, true, true, true], [20, 5, 5, 0]],
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
    tripsPromised: record[1],
    tripsOnTime: record[2],
    incidents: record[3],
  };

  return {
    name,
    documents,
    record: held,
    tier: tierOf(documents, held),
    onTimeRate: onTimeRate(held),
  };
});

/**
 * Every rung against every bar.
 *
 * Sixteen cases rather than a handful, because this is the comparison that
 * decides whether a carrier may bid and both sides run it: the board greys a
 * load with it and the server refuses one with it. A disagreement here shows
 * up as a load the app offered and the API then took away.
 */
const barCases = LADDER.flatMap((held) =>
  LADDER.map((required) => ({ held, required, meets: meets(held, required) })),
);

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

// --- the load board --------------------------------------------------------

/**
 * Ranking, with the sentence under each row.
 *
 * The ordering *is* the product, and the sentence is what a haulier argues
 * with — so both are fixture material. A server that ranks the same six loads
 * in a different order to the phone is a server telling a carrier to drive
 * somewhere else.
 */
const MATCH_NOW = new Date('2026-03-04T06:00:00.000Z');
const matchAt = (hours: number) => new Date(MATCH_NOW.getTime() + hours * 3_600_000);

const place = (lat: number, lon: number): Position => ({
  lat,
  lon,
  accuracy: 10,
  at: MATCH_NOW,
});

const LAGOS = place(6.4531, 3.3958);
const IBADAN = place(7.3775, 3.947);
const ABUJA = place(9.0765, 7.3986);
const KANO = place(12.0022, 8.5919);
const PORT_HARCOURT = place(4.8156, 7.0498);

const matchLoads: readonly Load[] = [
  {
    id: 'toward-home',
    origin: IBADAN,
    destination: LAGOS,
    weight: 28,
    requires: 'trailer_30t',
    offered: fromNaira(1_900_000),
    readyBy: matchAt(6),
    expiresAt: matchAt(48),
  },
  {
    id: 'away-from-home',
    origin: IBADAN,
    destination: KANO,
    weight: 28,
    requires: 'trailer_30t',
    offered: fromNaira(2_400_000),
    readyBy: matchAt(30),
    expiresAt: matchAt(72),
  },
  {
    id: 'urgent-and-near',
    origin: LAGOS,
    destination: ABUJA,
    weight: 24,
    requires: 'trailer_30t',
    readyBy: matchAt(-1),
    expiresAt: matchAt(12),
  },
  {
    id: 'too-heavy',
    origin: LAGOS,
    destination: ABUJA,
    weight: 34,
    requires: 'trailer_30t',
    readyBy: matchAt(6),
    expiresAt: matchAt(48),
  },
  {
    id: 'wrong-class',
    origin: LAGOS,
    destination: ABUJA,
    weight: 6,
    requires: 'canter',
    readyBy: matchAt(6),
    expiresAt: matchAt(48),
  },
  {
    id: 'expired',
    origin: LAGOS,
    destination: ABUJA,
    weight: 28,
    requires: 'trailer_30t',
    readyBy: matchAt(-30),
    expiresAt: matchAt(-1),
  },
  {
    id: 'unreachable',
    origin: PORT_HARCOURT,
    destination: ABUJA,
    weight: 28,
    requires: 'trailer_30t',
    readyBy: matchAt(6),
    expiresAt: matchAt(48),
  },
];

const matchCarriers: readonly { name: string; carrier: Carrier }[] = [
  {
    name: 'trailer near Ibadan, based in Lagos',
    carrier: { at: IBADAN, freeFrom: MATCH_NOW, truck: 'trailer_30t', base: LAGOS },
  },
  {
    // Without a base this reduces to ordinary proximity matching, and that is
    // the comparison the homeward weight has to be visible against.
    name: 'the same truck with nowhere to get back to',
    carrier: { at: IBADAN, freeFrom: MATCH_NOW, truck: 'trailer_30t' },
  },
  {
    name: 'a canter in Lagos',
    carrier: { at: LAGOS, freeFrom: MATCH_NOW, truck: 'canter', base: LAGOS },
  },
];

const matchCases = matchCarriers.map(({ name, carrier }) => ({
  name,
  hasBase: carrier.base !== undefined,
  truck: carrier.truck,
  ranked: rankLoads(carrier, matchLoads, MATCH_NOW).map((scored) => ({
    loadId: scored.load.id,
    scoreThousandths: Math.round(scored.score * 1000),
    blocked: scored.blocked,
    deadheadM: scored.deadhead,
    progressHomeM: scored.progressHome,
    because: scored.because,
  })),
}));

const BID_PICKUP = LAGOS;

const bids: readonly Bid[] = [
  {
    id: 'cheapest-and-new',
    carrierId: 'c1',
    amount: fromNaira(1_800_000),
    tripsCompleted: 0,
    tripsPromised: 0,
    tripsOnTime: 0,
    at: LAGOS,
    placedAt: MATCH_NOW,
  },
  {
    id: 'dearer-with-a-record',
    carrierId: 'c2',
    amount: fromNaira(1_980_000),
    tripsCompleted: 40,
    tripsPromised: 40,
    tripsOnTime: 38,
    at: IBADAN,
    placedAt: MATCH_NOW,
  },
  {
    id: 'one-trip-completed',
    carrierId: 'c3',
    amount: fromNaira(1_850_000),
    tripsCompleted: 1,
    tripsPromised: 1,
    tripsOnTime: 1,
    at: LAGOS,
    placedAt: MATCH_NOW,
  },
  {
    id: 'far-away',
    carrierId: 'c4',
    amount: fromNaira(1_820_000),
    tripsCompleted: 12,
    tripsPromised: 12,
    tripsOnTime: 6,
    at: KANO,
    placedAt: MATCH_NOW,
  },
  {
    // Twelve deliveries and not one deadline. The reliability term has to come
    // back null rather than 1.0, which is what the server used to make it.
    id: 'tracked-never-traded',
    carrierId: 'c5',
    amount: fromNaira(1_900_000),
    tripsCompleted: 12,
    tripsPromised: 0,
    tripsOnTime: 0,
    at: IBADAN,
    placedAt: MATCH_NOW,
  },
];

const bidCases = rankBids(bids, BID_PICKUP).map((scored) => ({
  bidId: scored.bid.id,
  scoreThousandths: Math.round(scored.score * 1000),
  reliabilityThousandths:
    scored.reliability === null ? null : Math.round(scored.reliability * 1000),
  kmToPickup: scored.kmToPickup,
  because: scored.because,
}));

// --- chaining --------------------------------------------------------------

const leg = (
  loadId: string,
  from: Position,
  fromName: string,
  to: Position,
  toName: string,
  readyHours: number,
  deliverHours: number | null,
  paysNaira: number,
): ChainLeg => ({
  loadId,
  from,
  to,
  fromName,
  toName,
  readyFrom: matchAt(readyHours),
  deliverBy: deliverHours === null ? null : matchAt(deliverHours),
  pays: fromNaira(paysNaira),
  distanceM: distance(from, to),
});

const chainStart = leg('lagos-ibadan', LAGOS, 'Lagos', IBADAN, 'Ibadan', 0, 8, 380_000);

const chainPool: readonly ChainLeg[] = [
  leg('ibadan-abuja', IBADAN, 'Ibadan', ABUJA, 'Abuja', 10, 30, 1_400_000),
  // Loads within reach of Ibadan but paying far less per kilometre driven.
  leg('ibadan-lagos-back', IBADAN, 'Ibadan', LAGOS, 'Lagos', 10, 20, 300_000),
  // Kano is beyond the repositioning limit from Ibadan.
  leg('kano-abuja', KANO, 'Kano', ABUJA, 'Abuja', 10, 40, 2_000_000),
  // Loads before the leg it would follow.
  leg('abuja-kano-early', ABUJA, 'Abuja', KANO, 'Kano', -4, 40, 1_800_000),
];

const fitCases = chainPool.map((candidate) => {
  const fit = canFollow(chainStart, candidate);
  return {
    loadId: candidate.loadId,
    ok: fit.ok,
    reason: fit.ok ? null : fit.reason,
    detail: fit.ok ? null : fit.detail,
    repositionM: fit.ok ? fit.repositionM : null,
  };
});

const built = chain(chainStart, chainPool);

const chainCase = {
  legIds: built.legs.map((each) => each.loadId),
  deadheadM: built.deadheadM,
  ladenM: built.laden,
  paysKobo: built.pays,
  ladenFractionThousandths: Math.round(ladenFraction(built) * 1000),
};

// --- consolidation ---------------------------------------------------------

const pairLoad = (
  id: string,
  weightKg: number,
  origin: Position,
  destination: Position,
  offeredNaira: number,
  truckClass: TruckClass = 'trailer_30t',
): PairLoad => ({
  id,
  origin: 'Lagos',
  destination: 'Kano',
  cargo: 'Cement',
  weightKg,
  offered: fromNaira(offeredNaira),
  readyFrom: matchAt(4),
  truckClass,
  shipperTier: 'verified',
  origin_: { lat: origin.lat, lon: origin.lon },
  destination_: { lat: destination.lat, lon: destination.lon },
});

const NEAR_LAGOS = place(6.6, 3.5);
const NEAR_KANO = place(12.1, 8.7);

const pairLoads: readonly PairLoad[] = [
  pairLoad('half-a-trailer', 15_000, LAGOS, KANO, 1_400_000),
  pairLoad('the-other-half', 12_000, NEAR_LAGOS, NEAR_KANO, 1_200_000),
  pairLoad('too-small-to-pair', 3_000, LAGOS, KANO, 400_000),
  pairLoad('wrong-truck', 12_000, LAGOS, KANO, 1_200_000, 'canter'),
  pairLoad('pickup-far-away', 14_000, ABUJA, KANO, 1_300_000),
];

const shareCases: { a: string; b: string; ok: boolean; reason: string | null; detail: string | null; fillThousandths: number | null }[] = [];
for (let i = 0; i < pairLoads.length; i++) {
  for (let j = i + 1; j < pairLoads.length; j++) {
    const a = pairLoads[i];
    const b = pairLoads[j];
    if (a === undefined || b === undefined) continue;
    const verdict = canShare(a, b, 'trailer_30t');
    shareCases.push({
      a: a.id,
      b: b.id,
      ok: verdict.ok,
      reason: verdict.ok ? null : verdict.reason,
      detail: verdict.ok ? null : verdict.detail,
      fillThousandths: verdict.ok ? Math.round(verdict.fill * 1000) : null,
    });
  }
}

const pairingCases = pairs(pairLoads, 'trailer_30t').map((pairing) => ({
  a: pairing.a.id,
  b: pairing.b.id,
  fillThousandths: Math.round(pairing.fill * 1000),
  paysAKobo: pairing.shipperPays[0],
  paysBKobo: pairing.shipperPays[1],
  carrierGetsKobo: pairing.carrierGets,
}));

// --- the dispute pack ------------------------------------------------------

/**
 * The assembler that invented fifty-one hours of missing evidence.
 *
 * These cases exist because a rendered pack was read, not because a test
 * failed: a continuously covered trip reported nine holes. The fixtures pin
 * the two rules that came out of it — a run of fixes covers the time it spans,
 * and only positions constitute coverage.
 */
const PACK_ASSEMBLED = new Date('2026-03-06T20:00:00.000Z');
const packAt = (hours: number) => new Date(PACK_ASSEMBLED.getTime() - (20 - hours) * 3_600_000);

const evidence = (
  kind: Evidence['kind'],
  atHours: number,
  untilHours: number | null,
  receivedHours: number | null,
  source: Evidence['source'],
  summary: string,
): Evidence => ({
  kind,
  at: packAt(atHours),
  ...(untilHours === null ? {} : { until: packAt(untilHours) }),
  receivedAt: receivedHours === null ? null : packAt(receivedHours),
  summary,
  source,
});

const packCases = (
  [
    [
      'a continuously covered trip has no holes in it',
      [
        evidence('trip_event', 0, null, null, 'system', 'open'),
        // Six hours before the tracker starts. A trip is open while a bid is
        // accepted and nothing is moving; that is a beginning, not a hole.
        evidence('message', 1, null, 1, 'shipper', 'Confirmed for tomorrow'),
        evidence('trip_event', 6, null, null, 'system', 'in_transit'),
        evidence('position', 6, 13, null, 'system', '42 fixes'),
        evidence('position', 13, 19, null, 'system', '38 fixes'),
        evidence('signature', 19, null, 19, 'driver', 'Signed by the storekeeper'),
      ],
    ],
    [
      'a real hole in the middle is named',
      [
        evidence('trip_event', 6, null, null, 'system', 'in_transit'),
        evidence('position', 6, 9, null, 'system', '18 fixes'),
        evidence('position', 15, 19, null, 'system', '24 fixes'),
      ],
    ],
    [
      'a signal-loss event does not start the clock',
      [
        // Sixteen hours before any position exists. `signal_lost` is measured
        // — the tracker raised it — and it is the absence of coverage.
        evidence('trip_event', 0, null, null, 'system', 'signal_lost'),
        evidence('position', 16, 19, null, 'system', '20 fixes'),
      ],
    ],
    [
      'a message written in a dead zone is attested late',
      [
        evidence('trip_event', 6, null, null, 'system', 'in_transit'),
        evidence('position', 6, 19, null, 'system', '80 fixes'),
        evidence('message', 8, null, 19, 'driver', 'Held at the checkpoint'),
        evidence('incident', 9, null, 9, 'driver', 'Detained'),
      ],
    ],
    ['nothing recorded at all', []],
  ] as const
).map(([name, items]) => {
  const pack = assemble('t1', items as readonly Evidence[], PACK_ASSEMBLED);

  return {
    name,
    items: (items as readonly Evidence[]).map((item) => ({
      kind: item.kind,
      atIso: iso(item.at),
      untilIso: item.until === undefined ? null : iso(item.until),
      receivedAtIso: item.receivedAt === null ? null : iso(item.receivedAt),
      summary: item.summary,
      source: item.source,
    })),
    itemCount: pack.items.length,
    weights: pack.items.map((item) => item.weight),
    counts: pack.counts,
    coveredMs: pack.coveredMs,
    gaps: pack.gaps.map((gap) => ({ fromIso: iso(gap.from), toIso: iso(gap.to), ms: gap.ms })),
    describe: describePack(pack),
    thin: isThin(pack),
  };
});

// --- deviation -------------------------------------------------------------

/**
 * The engine that argued back.
 *
 * Written first as cross-track distance and thrown away: the Lagos–Kano road
 * is up to 90 km off the straight line for hours, so that version fired on
 * every trip that went the right way. These cases pin the replacement — how
 * much further from the destination than the *closest* the truck has been
 * inside the window.
 */
const DEV_NOW = new Date('2026-03-05T12:00:00.000Z');
const devAt = (minutesAgo: number) => new Date(DEV_NOW.getTime() - minutesAgo * 60_000);

const KADUNA = place(10.5222, 7.4383);

/** A straight run of fixes between two points, evenly spaced in the window. */
const runBetween = (
  from: Position,
  to: Position,
  count: number,
  fromMinutesAgo: number,
  toMinutesAgo: number,
): Position[] =>
  Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1);
    return {
      lat: from.lat + (to.lat - from.lat) * t,
      lon: from.lon + (to.lon - from.lon) * t,
      accuracy: 10,
      at: devAt(fromMinutesAgo + (toMinutesAgo - fromMinutesAgo) * t),
    };
  });

const deviationCases = (
  [
    ['closing on the destination', runBetween(IBADAN, KADUNA, 10, 85, 0)],
    ['turned around and going back', runBetween(KADUNA, IBADAN, 10, 85, 0)],
    ['no positions at all', []],
    ['three fixes is a coverage gap, not a course', runBetween(KADUNA, IBADAN, 3, 85, 0)],
    ['half the window is not enough of it', runBetween(KADUNA, IBADAN, 10, 30, 0)],
    // Closed on the destination, then turned. Measuring from the window's
    // first fix would let the turn hide behind the progress before it.
    [
      'closed then turned',
      [
        ...runBetween(IBADAN, KADUNA, 6, 85, 45),
        ...runBetween(KADUNA, IBADAN, 6, 44, 0),
      ],
    ],
  ] as const
).map(([name, track]) => {
  const verdict = deviation(track as readonly Position[], KANO, DEV_NOW);

  return {
    name,
    fixes: (track as readonly Position[]).map((fix) => ({
      lat: fix.lat,
      lon: fix.lon,
      atIso: iso(fix.at),
    })),
    kind: verdict.kind,
    detail: verdict.kind === 'on_course' ? null : verdict.detail,
    furtherM: verdict.kind === 'deviating' ? verdict.furtherM : null,
    sinceMs: verdict.kind === 'deviating' ? verdict.sinceMs : null,
  };
});

// --- ratings ---------------------------------------------------------------

/**
 * Facts, never stars.
 *
 * The counts are the fixture material: "2 of 2" and "34 of 34" are the same
 * fraction and not the same evidence, so what is pinned here is the pair of
 * numbers rather than a ratio either side could compute differently.
 */
const REVIEW_DELIVERED = new Date('2026-03-01T09:00:00.000Z');
const REVIEW_NOW = new Date('2026-03-05T09:00:00.000Z');

const carrierReviews: readonly Review<CarrierClaim>[] = [
  {
    tripId: 't1',
    at: REVIEW_NOW,
    answers: { arrived_to_load: true, reachable: true, cargo_intact: true, no_extras: true },
    note: '',
  },
  {
    tripId: 't2',
    at: REVIEW_NOW,
    // "reachable" left unanswered on purpose: a missing answer is missing,
    // not a no. This shipper may never have needed to call.
    answers: { arrived_to_load: false, cargo_intact: true, no_extras: true },
    note: '',
  },
  {
    tripId: 't3',
    at: REVIEW_NOW,
    answers: { arrived_to_load: true, reachable: false, cargo_intact: true },
    note: '',
  },
];

const ratingCases = tally(carrierReviews, CARRIER_CLAIMS).map((counted) => ({
  claim: counted.claim,
  yes: counted.yes,
  asked: counted.asked,
  worthShowing: worthShowing(counted),
  label: labelCarrier(counted.claim as CarrierClaim),
}));

const reviewableCases = ([0, 1, 7, 8, -1] as const).map((days) => ({
  days,
  reviewable: reviewable(
    REVIEW_DELIVERED,
    new Date(REVIEW_DELIVERED.getTime() + days * 86_400_000),
  ),
}));

// --- utilisation -----------------------------------------------------------

/**
 * The number the product exists to move, and the projection built on it.
 *
 * Fixture material because both sides now compute it: the app renders it on
 * the fleet screen and the server derives it from the carrier's own trips. The
 * cases that matter are the degenerate ones — a fleet with no legs at all,
 * which must be 0% rather than NaN, and a fleet that never runs empty, which
 * has no return leg to be worth anything.
 */
const drivenLeg = (km: number, loaded: boolean, naira: number): Leg => ({
  metres: km * 1000,
  loaded,
  earned: loaded ? fromNaira(naira) : ZERO,
});

const utilisationCases = (
  [
    // The pitch, as a fleet actually runs: out loaded, back empty.
    ['half empty', [drivenLeg(830, true, 2_200_000), drivenLeg(830, false, 0), drivenLeg(760, true, 2_000_000), drivenLeg(760, false, 0)]],
    // Never empty. There is no return leg to fill, so the projection refuses.
    ['always loaded', [drivenLeg(500, true, 1_400_000), drivenLeg(500, true, 1_350_000), drivenLeg(480, true, 1_300_000), drivenLeg(520, true, 1_400_000)]],
    // Below MINIMUM_LEGS. The ratio is still arithmetic; the projection is not.
    ['too thin to project', [drivenLeg(830, true, 2_200_000), drivenLeg(830, false, 0)]],
    // Nothing at all. 0%, not NaN.
    ['no legs', []],
    // Every kilometre empty. A ratio of zero, and no loaded rate to project from.
    ['all empty', [drivenLeg(300, false, 0), drivenLeg(300, false, 0), drivenLeg(280, false, 0), drivenLeg(320, false, 0)]],
  ] as const
).map(([name, legs]) => {
  const result = utilisation(legs);
  const averageLegMetres =
    legs.length === 0
      ? 0
      : legs.reduce((total, one) => total + one.metres, 0) / legs.length;
  const worth = worthOfOneReturnLeg(result, averageLegMetres);

  return {
    name,
    legs: legs.map((one) => ({ metres: one.metres, loaded: one.loaded, earnedKobo: one.earned })),
    averageLegMetres,
    loadedMetres: result.loadedMetres,
    emptyMetres: result.emptyMetres,
    totalMetres: result.totalMetres,
    ratio: result.ratio,
    earnedKobo: result.earned,
    perKmDrivenKobo: result.perKmDriven,
    legCount: result.legs,
    ratioLabel: describeRatio(result),
    rateLabel: describeRate(result),
    worthOfOneReturnLegKobo: worth,
  };
});

// --- lanes -----------------------------------------------------------------

/**
 * The median of the last six, and the sentence a shipper reads.
 *
 * Both are fixture material. The median is the whole reason this engine exists
 * — a mean over two years anchors a shipper to a number that stopped being
 * true — and "Due tomorrow" against "Due in 1 days" is the kind of difference
 * only a rendered screen shows.
 */
const LANE_NOW = new Date('2026-03-10T09:00:00.000Z');
const laneDaysAgo = (days: number) => new Date(LANE_NOW.getTime() - days * 86_400_000);

const lane = (
  cadence: Cadence,
  historyNaira: readonly number[],
  lastRunDaysAgo: number | null,
): Lane => ({
  id: 'l1',
  shipperId: 's1',
  name: 'Apapa to Kano',
  origin: 'Lagos',
  destination: 'Kano',
  cargo: 'Cement',
  weightKg: 28_000,
  truck: 'trailer_30t',
  cadence,
  history: historyNaira.map((naira) => fromNaira(naira)),
  lastRunAt: lastRunDaysAgo === null ? null : laneDaysAgo(lastRunDaysAgo),
});

const laneCases = (
  [
    ['weekly, run five days ago', lane('weekly', [2_200_000, 2_240_000, 2_100_000], 5)],
    ['weekly, run eight days ago', lane('weekly', [2_200_000, 2_240_000, 2_100_000], 8)],
    ['weekly, run today', lane('weekly', [2_200_000, 2_240_000, 2_100_000], 0)],
    ['weekly, run six days ago', lane('weekly', [2_200_000, 2_240_000, 2_100_000], 6)],
    ['monthly, never run', lane('monthly', [], null)],
    ['ad hoc never comes due', lane('ad_hoc', [2_200_000, 2_240_000, 2_100_000], 40)],
    // Two runs is not a history: below three there is no typical price at all.
    ['two runs is not a history', lane('weekly', [2_200_000, 2_240_000], 5)],
    // An even count takes the mean of the middle two.
    [
      'eight runs, only the last six count',
      lane('weekly', [9_000_000, 9_000_000, 2_000_000, 2_100_000, 2_200_000, 2_300_000, 2_400_000, 2_500_000], 5),
    ],
  ] as const
).map(([name, each]) => {
  const typical = typicalPrice(each);

  return {
    name,
    cadence: each.cadence,
    runs: each.history.length,
    dueInMs: dueIn(each, LANE_NOW),
    due: isDue(each, LANE_NOW),
    typicalKobo: typical,
    describeDue: describeDue(each, LANE_NOW),
    describeCadence: describeCadence(each.cadence),
    unusualAtHalf: typical === null ? null : isUnusual(each, Math.round(typical * 0.5) as Kobo),
    unusualAtTenOver: typical === null ? null : isUnusual(each, Math.round(typical * 1.1) as Kobo),
  };
});

// --- alerts ----------------------------------------------------------------

/**
 * Who hears about what, how loudly, and how often.
 *
 * The whole policy table is emitted, not a sample of it: it is the thing
 * anybody arguing about notifications reads, and two servers with different
 * ideas of who hears about a duress alarm is the worst possible disagreement
 * in this product.
 */
const ALERT_NOW = new Date('2026-03-08T23:30:00.000Z');
const ALERT_KINDS = Object.keys(POLICY) as AlertKind[];
const AUDIENCES: readonly Audience[] = ['shipper', 'carrier', 'driver'];

const alertPolicy = ALERT_KINDS.map((kind) => ({
  kind,
  to: POLICY[kind].to,
  urgency: POLICY[kind].urgency,
  repeatAfterMs: POLICY[kind].repeatAfterMs,
  describe: describeAlert(kind),
}));

const quietHours = Array.from({ length: 24 }, (_, hour) => ({
  hour,
  quiet: isQuietHour(hour),
}));

const alertDecisions = ALERT_KINDS.flatMap((kind) =>
  AUDIENCES.flatMap((to) =>
    (
      [
        ['never sent, daytime', 12, null],
        ['never sent, midnight', 0, null],
        ['sent a minute ago', 12, 1],
        ['sent a day ago', 12, 24 * 60],
      ] as const
    ).map(([when, localHour, sentMinutesAgo]) => {
      const decision = decideAlert({
        kind,
        to,
        localHour,
        lastSentAt:
          sentMinutesAgo === null
            ? null
            : new Date(ALERT_NOW.getTime() - sentMinutesAgo * 60_000),
        now: ALERT_NOW,
      });

      return {
        kind,
        to,
        when,
        localHour,
        sentMinutesAgo,
        send: decision.send,
        urgency: decision.send ? decision.urgency : null,
        reason: decision.send ? null : decision.reason,
      };
    }),
  ),
);

const digestCases = (
  [
    [[], null],
    [['stalled'], null],
    [['stalled', 'stalled'], null],
    [['stalled', 'late'], null],
    [['stalled', 'late', 'stalled', 'incident'], null],
  ] as const
).map(([held]) => ({
  held,
  digest: digest(held as readonly AlertKind[]),
}));

// --- search ----------------------------------------------------------------

/**
 * The flattening is the whole engine.
 *
 * Three people write the same plate as `T-12345`, `T 12345` and `t12345`, and
 * a search that finds none of them is a search nobody uses twice. These cases
 * pin the flattening, and the sentence that is shown when a filter finds
 * nothing — an empty state that does not say what to relax is a dead end.
 */
const SEARCH_NOW = new Date('2026-03-07T09:00:00.000Z');

const searchTrips: readonly TripSummary[] = [
  {
    id: 't1',
    reference: 'BH-2026-0041',
    state: 'in_transit',
    origin: 'Lagos',
    destination: 'Kano',
    cargo: 'Cement',
    truckPlate: 'LSR-482-XA',
    driverName: 'Musa Danjuma',
    startedAt: new Date('2026-03-05T06:00:00.000Z'),
    hasOpenIncident: false,
    isLate: true,
  },
  {
    id: 't2',
    reference: 'BH-2026-0042',
    state: 'delivered',
    origin: 'Port Harcourt',
    destination: 'Abuja',
    cargo: 'Bagged rice',
    truckPlate: 'RVS-119-KJ',
    driverName: 'Chinedu Okafor',
    startedAt: new Date('2026-03-01T06:00:00.000Z'),
    hasOpenIncident: true,
    isLate: false,
  },
  {
    id: 't3',
    reference: 'BH-2026-0043',
    state: 'open',
    origin: 'Lagos',
    destination: 'Ibadan',
    cargo: 'Machine parts',
    truckPlate: 'KJA-771-BR',
    driverName: 'Tunde Adéyẹmí',
    startedAt: new Date('2026-03-06T06:00:00.000Z'),
    hasOpenIncident: false,
    isLate: false,
  },
];

const NO_TRIPS: TripFilter = {
  text: '',
  states: [],
  onlyLate: false,
  onlyWithIncidents: false,
  since: null,
  until: null,
};

const tripFilterCases = (
  [
    ['nothing set', NO_TRIPS],
    ['a plate written with a dash', { ...NO_TRIPS, text: 'LSR-482-XA' }],
    ['the same plate with a space', { ...NO_TRIPS, text: 'lsr 482 xa' }],
    ['the same plate run together in lower case', { ...NO_TRIPS, text: 'lsr482xa' }],
    // Accents stripped both ways: somebody typing without a keyboard for them
    // still finds the driver whose name has them.
    ['a name with its accents', { ...NO_TRIPS, text: 'Adéyẹmí' }],
    ['the same name without them', { ...NO_TRIPS, text: 'adeyemi' }],
    ['a town', { ...NO_TRIPS, text: 'lagos' }],
    ['one state', { ...NO_TRIPS, states: ['in_transit'] }],
    ['only late', { ...NO_TRIPS, onlyLate: true }],
    ['only with an open incident', { ...NO_TRIPS, onlyWithIncidents: true }],
    ['since the fourth', { ...NO_TRIPS, since: new Date('2026-03-04T00:00:00.000Z') }],
    ['nothing matches', { ...NO_TRIPS, text: 'zzz' }],
  ] as const
).map(([name, raw]) => {
  const filter: TripFilter = raw;

  return {
    name,
    // The filter itself, not only its name. The C# side builds the same
    // object from this rather than reconstructing it from the case name —
    // a fixture whose inputs have to be inferred is a fixture that drifts.
    text: filter.text,
    states: filter.states,
    onlyLate: filter.onlyLate,
    onlyWithIncidents: filter.onlyWithIncidents,
    sinceIso: filter.since === null ? null : iso(filter.since),
    untilIso: filter.until === null ? null : iso(filter.until),
    matched: filterTrips(searchTrips, filter).map((trip) => trip.id),
    filtering: isFiltering(filter),
    describe: describeTripFilter(filter),
  };
});

const searchLoads: readonly LoadSummary[] = [
  {
    id: 'l1',
    origin: 'Lagos',
    destination: 'Kano',
    cargo: 'Cement',
    weightKg: 28_000,
    offered: fromNaira(2_240_000),
    readyFrom: new Date('2026-03-08T06:00:00.000Z'),
    truckClass: 'trailer_30t',
    shipperTier: 'trusted',
  },
  {
    id: 'l2',
    origin: 'Ibadan',
    destination: 'Lagos',
    cargo: 'Yams',
    weightKg: 6_000,
    offered: fromNaira(240_000),
    readyFrom: new Date('2026-03-07T18:00:00.000Z'),
    truckClass: 'canter',
    shipperTier: 'verified',
  },
  {
    // No established standing. This product has no shipper ladder yet, so this
    // is what most loads look like — and a tier filter must exclude it rather
    // than admit it wearing a badge the platform invented.
    id: 'l3',
    origin: 'Kano',
    destination: 'Kaduna',
    cargo: 'Fertiliser',
    weightKg: 20_000,
    offered: fromNaira(900_000),
    readyFrom: new Date('2026-03-07T09:00:00.000Z'),
    truckClass: 'trailer_30t',
    shipperTier: null,
  },
];

const NO_LOADS: LoadFilter = {
  text: '',
  truckClasses: [],
  minimumOffer: null,
  readyBefore: null,
  tiers: [],
};

const loadFilterCases = (
  [
    ['nothing set', NO_LOADS],
    ['one class', { ...NO_LOADS, truckClasses: ['canter'] }],
    ['a floor under the price', { ...NO_LOADS, minimumOffer: fromNaira(1_000_000) }],
    ['ready before this evening', { ...NO_LOADS, readyBefore: new Date('2026-03-07T20:00:00.000Z') }],
    ['trusted shippers only', { ...NO_LOADS, tiers: ['trusted'] }],
    ['a town', { ...NO_LOADS, text: 'kano' }],
    ['nothing matches', { ...NO_LOADS, text: 'zzz' }],
  ] as const
).map(([name, raw]) => {
  const filter: LoadFilter = raw;

  return {
    name,
    text: filter.text,
    truckClasses: filter.truckClasses,
    minimumOfferKobo: filter.minimumOffer,
    readyBeforeIso: filter.readyBefore === null ? null : iso(filter.readyBefore),
    tiers: filter.tiers,
    matched: filterLoads(searchLoads, filter).map((load) => load.id),
    whyNothing: whyNothing(filter),
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
    ladder: LADDER,
    cases: trustCases,
    bars: barCases,
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
  matching: {
    maxDeadheadM: MAX_DEADHEAD_M,
    minimumTripsForReliability: MINIMUM_TRIPS_FOR_RELIABILITY,
    premiumTolerance: PREMIUM_TOLERANCE,
    nowIso: iso(MATCH_NOW),
    loads: matchLoads.map((load) => ({
      id: load.id,
      originLat: load.origin.lat,
      originLon: load.origin.lon,
      destinationLat: load.destination.lat,
      destinationLon: load.destination.lon,
      weightTonnes: load.weight,
      requires: load.requires,
      offeredKobo: load.offered ?? null,
      readyByIso: iso(load.readyBy),
      expiresAtIso: iso(load.expiresAt),
    })),
    carriers: matchCases,
    bidPickupLat: BID_PICKUP.lat,
    bidPickupLon: BID_PICKUP.lon,
    bids: bids.map((bid) => ({
      id: bid.id,
      amountKobo: bid.amount,
      tripsCompleted: bid.tripsCompleted,
      tripsPromised: bid.tripsPromised,
      tripsOnTime: bid.tripsOnTime,
      atLat: bid.at.lat,
      atLon: bid.at.lon,
    })),
    rankedBids: bidCases,
  },
  chaining: {
    maxRepositionM: MAX_REPOSITION_M,
    repositionSpeedMs: REPOSITION_SPEED_MS,
    connectionSlackMs: CONNECTION_SLACK_MS,
    maxChainLegs: MAX_CHAIN_LEGS,
    start: {
      loadId: chainStart.loadId,
      fromLat: chainStart.from.lat,
      fromLon: chainStart.from.lon,
      toLat: chainStart.to.lat,
      toLon: chainStart.to.lon,
      fromName: chainStart.fromName,
      toName: chainStart.toName,
      readyFromIso: iso(chainStart.readyFrom),
      deliverByIso: chainStart.deliverBy === null ? null : iso(chainStart.deliverBy),
      paysKobo: chainStart.pays,
      distanceM: chainStart.distanceM,
    },
    pool: chainPool.map((each) => ({
      loadId: each.loadId,
      fromLat: each.from.lat,
      fromLon: each.from.lon,
      toLat: each.to.lat,
      toLon: each.to.lon,
      fromName: each.fromName,
      toName: each.toName,
      readyFromIso: iso(each.readyFrom),
      deliverByIso: each.deliverBy === null ? null : iso(each.deliverBy),
      paysKobo: each.pays,
      distanceM: each.distanceM,
    })),
    fits: fitCases,
    built: chainCase,
  },
  consolidation: {
    pickupSpreadM: PICKUP_SPREAD_M,
    dropSpreadM: DROP_SPREAD_M,
    minimumFillThousandths: Math.round(MINIMUM_FILL * 1000),
    shipperDiscountPct: SHIPPER_DISCOUNT_PCT,
    loads: pairLoads.map((load) => ({
      id: load.id,
      weightKg: load.weightKg,
      offeredKobo: load.offered,
      truckClass: load.truckClass,
      originLat: load.origin_.lat,
      originLon: load.origin_.lon,
      destinationLat: load.destination_.lat,
      destinationLon: load.destination_.lon,
      readyFromIso: iso(load.readyFrom),
    })),
    verdicts: shareCases,
    pairs: pairingCases,
  },
  search: {
    nowIso: iso(SEARCH_NOW),
    trips: searchTrips.map((trip) => ({
      id: trip.id,
      reference: trip.reference,
      state: trip.state,
      origin: trip.origin,
      destination: trip.destination,
      cargo: trip.cargo,
      truckPlate: trip.truckPlate,
      driverName: trip.driverName,
      startedAtIso: iso(trip.startedAt),
      hasOpenIncident: trip.hasOpenIncident,
      isLate: trip.isLate,
    })),
    tripFilters: tripFilterCases,
    loads: searchLoads.map((load) => ({
      id: load.id,
      origin: load.origin,
      destination: load.destination,
      cargo: load.cargo,
      weightKg: load.weightKg,
      offeredKobo: load.offered,
      readyFromIso: iso(load.readyFrom),
      truckClass: load.truckClass,
      shipperTier: load.shipperTier,
    })),
    loadFilters: loadFilterCases,
  },
  alerts: {
    quietFromHour: QUIET_FROM_HOUR,
    quietToHour: QUIET_TO_HOUR,
    nowIso: iso(ALERT_NOW),
    policy: alertPolicy,
    quietHours,
    decisions: alertDecisions,
    digests: digestCases,
  },
  utilisation: {
    minimumLegs: MINIMUM_LEGS,
    cases: utilisationCases,
  },
  lanes: {
    dueWarningMs: DUE_WARNING_MS,
    recentRuns: RECENT_RUNS,
    minimumRunsForTypical: MINIMUM_RUNS_FOR_TYPICAL,
    unusualFraction: UNUSUAL_FRACTION,
    nowIso: iso(LANE_NOW),
    cases: laneCases,
  },
  ratings: {
    reviewWindowDays: REVIEW_WINDOW_DAYS,
    minimumAnswers: MINIMUM_ANSWERS,
    carrierClaims: CARRIER_CLAIMS,
    shipperClaims: SHIPPER_CLAIMS,
    shipperLabels: SHIPPER_CLAIMS.map((claim) => labelShipper(claim)),
    reviews: carrierReviews.map((review) => ({
      tripId: review.tripId,
      answers: review.answers,
    })),
    tallies: ratingCases,
    windows: reviewableCases,
  },
  deviation: {
    deviationM: DEVIATION_M,
    windowMs: DEVIATION_WINDOW_MS,
    nowIso: iso(DEV_NOW),
    destinationLat: KANO.lat,
    destinationLon: KANO.lon,
    cases: deviationCases,
  },
  dispute: {
    lateAfterMs: LATE_AFTER_MS,
    gapMs: GAP_MS,
    minimumCoveredMs: MINIMUM_COVERED_MS,
    assembledAtIso: iso(PACK_ASSEMBLED),
    cases: packCases,
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
      `${barCases.length} bars`,
      `${vehicleCases.length} vehicles`,
      `${escrowCases.length} escrow schedules`,
      `${cancelCases.length} cancellations`,
      `${costCases.length} cost models`,
      `${earningsCases.length} statements`,
      `${matchCases.length} load rankings`,
      `${bidCases.length} bids`,
      `${fitCases.length} chain fits`,
      `${shareCases.length} pair verdicts`,
      `${packCases.length} dispute packs`,
      `${deviationCases.length} deviation verdicts`,
      `${ratingCases.length} tallies`,
      `${laneCases.length} lanes`,
      `${utilisationCases.length} utilisations`,
      `${alertDecisions.length} alert decisions`,
      `${tripFilterCases.length} trip filters`,
      `${loadFilterCases.length} load filters`,
    ].join(', ')
  }\n`,
);
