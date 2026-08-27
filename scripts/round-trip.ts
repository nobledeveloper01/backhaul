/**
 * Drives the real server through the app's own client.
 *
 * Unit tests prove the client handles a mocked server. This proves the two
 * sides actually agree — that what the C# controllers emit is what the
 * TypeScript client parses, field for field, timestamp spelling included.
 *
 * That is the one thing the parity fixtures cannot check. They hold the two
 * *domains* to the same answers; nothing was holding the two *wire formats*
 * to each other, and the last time these two spoke different spellings of the
 * same instant it took a fixture comparing refusal wording to notice.
 *
 *   make round-trip     # starts nothing; expects a server on :5111
 */

import { BackhaulApi } from '../apps/mobile/src/api/client.ts';
import { clean, distanceTravelled, observe } from '../packages/domain/src/index.ts';
import type { Position } from '../packages/domain/src/index.ts';

const BASE = process.env['BACKHAUL_API'] ?? 'http://127.0.0.1:5111';

/**
 * A driver token.
 *
 * The server seeds three when it runs on the in-memory store and prints them
 * at start-up; against a real database, mint one with
 * `--issue-token driver <guid>` and pass it in `BACKHAUL_TOKEN`.
 */
const TOKEN = process.env['BACKHAUL_TOKEN'] ?? null;

const api = new BackhaulApi(BASE, TOKEN);

/** The seeded driver, whose id the server fixes so a restart is repeatable. */
const SEEDED_DRIVER = 'd0000000-0000-4000-8000-000000000001';
const DRIVER_ID = process.env['BACKHAUL_DRIVER_ID'] ?? SEEDED_DRIVER;

let failures = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    process.stdout.write(`  ok    ${name}\n`);
  } else {
    failures++;
    process.stdout.write(`  FAIL  ${name}${detail === '' ? '' : ` — ${detail}`}\n`);
  }
}

/** A stable id per run, so a re-run does not collide with the last one. */
function uuid(seed: number): string {
  const hex = seed.toString(16).padStart(12, '0');
  return `b0000000-0000-4000-8000-${hex}`;
}

const T0 = new Date('2026-03-04T06:00:00.000Z');
const at = (minutes: number): Date => new Date(T0.getTime() + minutes * 60_000);

const fix = (lat: number, lon: number, minutes: number, id: string): Position & { id: string } => ({
  id,
  lat,
  lon,
  accuracy: 10,
  at: at(minutes),
});

async function main(): Promise<void> {
  process.stdout.write(`Round trip against ${BASE}\n\n`);

  const health = await api.health();
  if (!health.ok) {
    process.stdout.write(
      `  FAIL  the server is not answering — start it with 'make server-run'\n`,
    );
    process.exit(1);
  }
  check(`server is up (store: ${health.value.store})`, true);
  if (!health.value.durable) {
    process.stdout.write('        note: in-memory store, so nothing here survives a restart\n');
  }

  // A run-unique trip id, derived from the clock so re-runs do not collide.
  const run = Math.floor(Date.now() / 1000) % 0xffffffff;
  const tripId = uuid(run);

  // Authentication, before anything that needs it.
  const anonymous = new BackhaulApi(BASE, null);
  const refused = await anonymous.trip(tripId);
  check(
    'an anonymous request is refused',
    !refused.ok && refused.failure.kind === 'refused' && refused.failure.status === 401,
  );

  if (TOKEN === null) {
    process.stdout.write(
      '  FAIL  no BACKHAUL_TOKEN — take a driver token from the server log\n',
    );
    process.exit(1);
  }

  // The caller is the driver, so the driver is one of the three parties. A
  // trip you would not be able to see is a trip the server will not let you
  // open.
  const parties = {
    driverId: DRIVER_ID,
    carrierId: uuid(run + 900),
    shipperId: uuid(run + 901),
  };

  const opened = await api.openTrip(
    tripId,
    parties,
    { origin: 'Lagos', destination: 'Kano' },
    at(0),
    'driver',
    'Cement, Lagos to Kano',
  );
  check('a trip opens', opened.ok, opened.ok ? '' : opened.failure.detail);
  if (!opened.ok) return;
  check("it opens 'open'", opened.value.state === 'open', opened.value.state);
  check('it is not tracking yet', opened.value.tracking === false);

  // The refusal path, in the machine's own words.
  const illegal = await api.recordEvent(tripId, 'delivered', at(60), 'driver');
  check('an illegal transition is refused', !illegal.ok);
  if (!illegal.ok && illegal.failure.kind === 'refused') {
    check(
      'the refusal carries the sentence, not a status line',
      illegal.failure.detail === "A trip cannot go from 'open' to 'delivered'.",
      illegal.failure.detail,
    );
  }

  for (const [state, minutes] of [
    ['assigned', 30],
    ['loading', 60],
    ['in_transit', 120],
  ] as const) {
    const moved = await api.recordEvent(tripId, state, at(minutes), 'driver');
    check(`it moves to ${state}`, moved.ok, moved.ok ? '' : moved.failure.detail);
  }

  const running = await api.trip(tripId);
  check('it is now tracking', running.ok && running.value.tracking === true);
  if (running.ok) {
    check(
      'timestamps survive the round trip exactly',
      running.value.history[0]?.at.toISOString() === at(0).toISOString(),
      running.value.history[0]?.at.toISOString(),
    );
    check(
      'the history is complete and in order',
      running.value.history.map((e) => e.state).join(',') ===
        'open,assigned,loading,in_transit',
      running.value.history.map((e) => e.state).join(','),
    );
  }

  // A batch with one fix the cleaner will throw away.
  const samples = [
    fix(6.455, 3.3841, 125, uuid(run + 1)),
    fix(6.9, 3.9, 245, uuid(run + 2)),
    fix(12.0022, 8.592, 246, uuid(run + 3)), // a tower fix, 800 km in a minute
  ];

  const batchId = uuid(run + 100);
  const first = await api.uploadBatch(batchId, tripId, samples);
  check('a batch uploads', first.ok, first.ok ? '' : first.failure.detail);
  if (first.ok) {
    check('all three are accepted', first.value.accepted === 3, String(first.value.accepted));
    check('it is not a replay', first.value.replayed === false);
  }

  const replay = await api.uploadBatch(batchId, tripId, samples);
  check('the same batch replays rather than writing twice', replay.ok && replay.value.replayed);

  const track = await api.track(tripId);
  check('the track reads back', track.ok, track.ok ? '' : track.failure.detail);
  if (track.ok) {
    check('the tower fix was excluded', track.value.dropped === 1, String(track.value.dropped));
    check('and it says how many survived', track.value.kept === 2, String(track.value.kept));

    // The claim this whole script exists to make: run the same fixes through
    // the TypeScript domain and demand the same answer the C# server gave.
    const locally = clean(samples);
    check(
      'the server and the app clean the track identically',
      locally.kept.length === track.value.kept &&
        locally.dropped.length === track.value.dropped,
      `local ${locally.kept.length}/${locally.dropped.length}, server ${track.value.kept}/${track.value.dropped}`,
    );
    check(
      'and agree on the distance, to the metre',
      distanceTravelled(locally) === track.value.distanceMetres,
      `local ${distanceTravelled(locally)}, server ${track.value.distanceMetres}`,
    );

    const localObservation = observe(locally.kept, new Date());
    check(
      'and on what the truck is doing',
      localObservation === track.value.observation,
      `local ${localObservation}, server ${track.value.observation}`,
    );
  }

  // --- the share link, and the one route with no token on it --------------

  const issued = await api.issueShare(tripId, 'position', 'Alhaji Bello');
  check('a share link is issued', issued.ok, issued.ok ? '' : issued.failure.detail);

  if (issued.ok) {
    const token = issued.value.token;

    // Deliberately *not* through `BackhaulApi`: the whole claim is that this
    // works with no credentials at all, and the client always carries one.
    const followed = await fetch(`${BASE}/v1/share/${token}`);
    check('a stranger with no token can follow it', followed.status === 200, String(followed.status));

    const view = (await followed.json()) as {
      origin: string;
      destination: string;
      track?: unknown;
      quality?: unknown;
    };
    check('and sees the corridor', view.origin === 'Lagos' && view.destination === 'Kano');

    // `position` scope. The absence of these is the product decision, not an
    // implementation detail, so it is asserted rather than assumed.
    check('a position link carries no track', view.track === null || view.track === undefined);
    check('and no fix quality', view.quality === null || view.quality === undefined);

    const raw = JSON.stringify(view);
    check(
      'and nothing about money or the parties',
      !/naira|kobo|fare|price|driverId|shipperId/i.test(raw),
      raw.slice(0, 120),
    );

    const revoked = await api.revokeShare(tripId, issued.value.id);
    check('the link revokes', revoked.ok, revoked.ok ? '' : revoked.failure.detail);

    const after = await fetch(`${BASE}/v1/share/${token}`);
    check('a revoked link is gone, not merely absent', after.status === 410, String(after.status));

    const refusal = (await after.json()) as { refusal: string; message: string };
    // Character-for-character the sentence in `packages/domain/src/sharing.ts`.
    // The parity fixtures exist because two implementations of one rule drift,
    // and copy is a rule: a holder who reads one wording in the app and
    // another on the web has found a seam.
    check(
      'and says it was turned off, in the same words the app uses',
      refusal.refusal === 'revoked' &&
        refusal.message ===
          'This link was turned off. Ask whoever sent it for a new one.',
      refusal.message,
    );
  }

  process.stdout.write(
    failures === 0 ? '\nround trip clean\n' : `\n${failures} failed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await main();
