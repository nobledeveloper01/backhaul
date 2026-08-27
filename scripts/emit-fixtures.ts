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
    ].join(', ')
  }\n`,
);
