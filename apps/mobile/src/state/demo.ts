import {
  clean,
  isSystemRaised,
  transition,
  type CleanedTrack,
  type Position,
  type TripEvent,
  type TruckClass,
} from '@backhaul/domain';

/**
 * A day's worth of freight, built so every screen has something true to show.
 *
 * **Nothing here is a hand-written figure.** The tracks are position fixes and
 * every number a screen renders is computed from them by the same engines the
 * server runs. A demo dataset with the answers baked in would let a screen
 * look right while the engine behind it was wrong, which is the one thing this
 * is meant to guard against.
 *
 * The tracks are deliberately imperfect: one has a two-hour coverage gap on
 * the Kaduna–Kano stretch, one has a cell-tower fix that the cleaner throws
 * away, and one has not started. Those are the states that are hard to render
 * honestly, so they are the states that exist here.
 */

export interface DemoTrip {
  readonly id: string;
  readonly cargo: string;
  readonly originName: string;
  readonly destinationName: string;
  readonly origin: Position;
  readonly destination: Position;
  readonly truck: TruckClass;
  readonly plate: string;
  readonly driver: string;
  readonly carrier: string;
  readonly history: readonly TripEvent[];
  readonly track: CleanedTrack;
  readonly raw: readonly Position[];
  readonly agreedNaira: number;
  readonly advanceNaira: number;
  readonly waitedMinutes: number;
}

/**
 * The clock the demo is anchored to.
 *
 * Everything is expressed relative to it, so the app shows a trip in progress
 * whenever it is opened rather than one that finished in March.
 */
export function demoNow(): Date {
  return new Date();
}

const place = (lat: number, lon: number, at: Date, accuracy = 12): Position => ({
  lat,
  lon,
  accuracy,
  at,
});

const LAGOS = { lat: 6.455, lon: 3.3841 };
const IBADAN = { lat: 7.3775, lon: 3.947 };
const ILORIN = { lat: 8.4966, lon: 4.5421 };
const KADUNA = { lat: 10.5222, lon: 7.4383 };
const KANO = { lat: 12.0022, lon: 8.592 };
const ABUJA = { lat: 9.0765, lon: 7.3986 };
const PH = { lat: 4.8156, lon: 7.0498 };

/**
 * Walks the state machine, so a demo trip cannot be in a state the machine
 * forbids — and cannot attribute a state to the wrong actor.
 *
 * Every event was `driver` at first, which put "signal lost · driver" in a
 * rendered history: a driver reporting the loss of their own signal, which is
 * the thing the tracker detects and the thing they cannot report. `isSystemRaised`
 * decides the actor rather than the caller, so the two cannot drift.
 */
function walk(steps: readonly [Parameters<typeof transition>[1], Date][]): TripEvent[] {
  const events: TripEvent[] = [];
  for (const [state, at] of steps) {
    const actor = isSystemRaised(state) ? 'system' : 'driver';
    const result = transition(events, state, at, actor);
    if (!result.ok) {
      throw new Error(`demo trip is not walkable: ${result.detail}`);
    }
    events.push(result.event);
  }
  return events;
}

const minutesAgo = (now: Date, minutes: number): Date =>
  new Date(now.getTime() - minutes * 60_000);

function interpolate(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  fraction: number,
): { lat: number; lon: number } {
  return {
    lat: from.lat + (to.lat - from.lat) * fraction,
    lon: from.lon + (to.lon - from.lon) * fraction,
  };
}

/**
 * Minutes between fixes on a moving leg.
 *
 * Under the twenty-minute silence threshold, deliberately. The first version of
 * this took a fix count per leg, which worked out at roughly two hours between
 * fixes — so the corridor view honestly reported *thirty-three* stretches with
 * no signal on a trip that has one. The data was wrong, not the view.
 *
 * The real policy samples every 60–900 seconds by speed and battery. Fifteen
 * minutes is the slow end of that, which keeps the dataset a readable size
 * without inventing gaps.
 */
const CADENCE_MIN = 15;

/** Samples a leg into fixes at a cadence the tracking policy would actually produce. */
function leg(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  startMinutesAgo: number,
  endMinutesAgo: number,
  now: Date,
): Position[] {
  const span = startMinutesAgo - endMinutesAgo;
  const count = Math.max(2, Math.round(span / CADENCE_MIN) + 1);

  const out: Position[] = [];
  for (let i = 0; i < count; i++) {
    const f = i / (count - 1);
    const point = interpolate(from, to, f);
    const minutes = startMinutesAgo + (endMinutesAgo - startMinutesAgo) * f;
    out.push(place(point.lat, point.lon, minutesAgo(now, minutes)));
  }
  return out;
}

export function demoTrips(now: Date): DemoTrip[] {
  // --- 1. On the road, with a coverage gap behind it ----------------------
  const gapStart = interpolate(ILORIN, KADUNA, 0.4);
  const gapEnd = interpolate(ILORIN, KADUNA, 0.75);

  const running: Position[] = [
    ...leg(LAGOS, IBADAN, 2600, 2330, now),
    ...leg(IBADAN, ILORIN, 2330, 2050, now),
    ...leg(ILORIN, gapStart, 2050, 1900, now),
    // Two hours of nothing on the Kaduna approach. One gap, deliberately, and
    // it is the reason the silence threshold is twenty minutes rather than
    // five — this stretch of road has no coverage as a matter of course.
    ...leg(gapEnd, KADUNA, 1780, 1600, now),
    ...leg(KADUNA, interpolate(KADUNA, KANO, 0.55), 1600, 45, now),
  ];

  // --- 2. Nearly there, but one fix is a cell tower ------------------------
  const nearlyThere: Position[] = [
    ...leg(PH, interpolate(PH, ABUJA, 0.9), 900, 300, now),
    // A tower fix that snaps to Kano. The cleaner throws it away and says so;
    // the screen shows the count it discarded next to the distance.
    place(KANO.lat, KANO.lon, minutesAgo(now, 295)),
    ...leg(interpolate(PH, ABUJA, 0.9), ABUJA, 290, 12, now),
  ];

  // --- 3. Loading. Nothing to show, and it must not pretend otherwise -----
  const notStarted: Position[] = [];

  return [
    {
      id: 'a1f0c2e4-0000-4000-8000-000000000001',
      cargo: '28 t cement',
      originName: 'Lagos',
      destinationName: 'Kano',
      origin: place(LAGOS.lat, LAGOS.lon, minutesAgo(now, 2600)),
      destination: place(KANO.lat, KANO.lon, now),
      truck: 'trailer_30t',
      plate: 'LSR-482-XA',
      driver: 'Musa Danjuma',
      carrier: 'Sahel Haulage',
      history: walk([
        ['open', minutesAgo(now, 3200)],
        ['assigned', minutesAgo(now, 3000)],
        ['loading', minutesAgo(now, 2800)],
        ['in_transit', minutesAgo(now, 2600)],
        ['signal_lost', minutesAgo(now, 2050)],
        ['in_transit', minutesAgo(now, 1380)],
      ]),
      raw: running,
      track: clean(running),
      agreedNaira: 2_240_000,
      advanceNaira: 500_000,
      waitedMinutes: 690,
    },
    {
      id: 'a1f0c2e4-0000-4000-8000-000000000002',
      cargo: '14 t bagged rice',
      originName: 'Port Harcourt',
      destinationName: 'Abuja',
      origin: place(PH.lat, PH.lon, minutesAgo(now, 900)),
      destination: place(ABUJA.lat, ABUJA.lon, now),
      truck: 'truck_15t',
      plate: 'RVS-119-KJ',
      driver: 'Emeka Obi',
      carrier: 'Delta Line Logistics',
      history: walk([
        ['open', minutesAgo(now, 1400)],
        ['assigned', minutesAgo(now, 1200)],
        ['loading', minutesAgo(now, 1000)],
        ['in_transit', minutesAgo(now, 900)],
      ]),
      raw: nearlyThere,
      track: clean(nearlyThere),
      agreedNaira: 1_180_000,
      advanceNaira: 0,
      waitedMinutes: 200,
    },
    {
      id: 'a1f0c2e4-0000-4000-8000-000000000003',
      cargo: '4 t machine parts',
      originName: 'Lagos',
      destinationName: 'Ibadan',
      origin: place(LAGOS.lat, LAGOS.lon, now),
      destination: place(IBADAN.lat, IBADAN.lon, now),
      truck: 'canter',
      plate: 'KJA-771-BR',
      driver: 'Tunde Adeyemi',
      carrier: 'Tunde Adeyemi',
      history: walk([
        ['open', minutesAgo(now, 300)],
        ['assigned', minutesAgo(now, 120)],
        ['loading', minutesAgo(now, 40)],
      ]),
      raw: notStarted,
      track: clean(notStarted),
      agreedNaira: 165_000,
      advanceNaira: 0,
      waitedMinutes: 40,
    },
  ];
}
