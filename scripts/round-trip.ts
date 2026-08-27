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
    // The three parties, read back off the same trip they were opened with.
    // A driver screen decides whether it is looking at its own trip by
    // comparing these against the signed-in principal, so a trip that comes
    // back without them is a screen that quietly shows somebody else's chrome.
    check(
      'and it names the three parties it was opened with',
      running.value.driverId === parties.driverId &&
        running.value.carrierId === parties.carrierId &&
        running.value.shipperId === parties.shipperId,
      `${running.value.driverId} / ${running.value.carrierId} / ${running.value.shipperId}`,
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


  // --- everything the screens read ----------------------------------------
  //
  // One call per client method, checked for a field the server actually fills.
  // The point is not the arithmetic — the parity fixtures hold that — but the
  // wire: a field renamed on one side and not the other reads as `undefined`
  // on a screen and as nothing at all in a test that only asserts `ok`.

  {
    const listed = await api.trips();
    check('the trip list reads back', listed.ok, listed.ok ? '' : listed.failure.detail);
    if (listed.ok) {
      const mine = listed.value.find((row) => row.id === tripId);
      check('and holds the trip just opened', mine !== undefined);
      check(
        'with a corridor and a state, not undefined',
        mine?.origin === 'Lagos' && mine.state !== undefined,
        `${mine?.origin} / ${mine?.state}`,
      );
      // The distinction a list must not lose: never reported is not "long ago".
      check('and a real last-seen, since fixes arrived', mine?.lastSeenAt instanceof Date);
    }
  }

  {
    const sent = await api.sendMessage(tripId, {
      id: uuid(Date.now() % 1_000_000_000),
      from: 'driver',
      body: 'Held at the checkpoint',
      at: at(200),
    });
    check('a message posts', sent.ok, sent.ok ? '' : sent.failure.detail);

    const thread = await api.messages(tripId);
    check('the thread reads back', thread.ok, thread.ok ? '' : thread.failure.detail);
    if (thread.ok) {
      const first = thread.value[0];
      check('with both timestamps parsed', first?.at instanceof Date && first.receivedAt instanceof Date);
    }
  }

  {
    const raised = await api.reportIncident(tripId, {
      kind: 'detained',
      at: at(210),
      note: 'Held at Jebba',
      reportedBy: 'driver',
      photoIds: ['p0'],
    });
    check('an incident reports', raised.ok, raised.ok ? '' : raised.failure.detail);
    if (raised.ok) {
      // Severity is computed by the domain, not sent — a client that had to
      // pick it would be a second implementation of the rule.
      check('and comes back with a severity it did not send', raised.value.severity !== '');
      check('and whether it raises a dispute', typeof raised.value.raisesDispute === 'boolean');
    }

    const open = await api.incidents(tripId);
    check('incidents read back', open.ok && open.value.length >= 1);
  }

  {
    const route = await api.waypoints(tripId);
    check('waypoints read back', route.ok, route.ok ? '' : route.failure.detail);
    if (route.ok) {
      check('with chargeable waiting as a number', typeof route.value.chargeableWaitingMs === 'number');
    }
  }

  {
    const drops = await api.drops(tripId);
    check('drops read back', drops.ok, drops.ok ? '' : drops.failure.detail);
    if (drops.ok) {
      check('with a fee in kobo', typeof drops.value.dropFeeKobo === 'number');
    }

    const levy = await api.recordLevy(tripId, {
      id: uuid((Date.now() % 1_000_000_000) + 1),
      kind: 'police',
      amountKobo: 500_000,
      at: at(220),
      note: 'Ogere',
    });
    check('a levy records', levy.ok, levy.ok ? '' : levy.failure.detail);
    if (levy.ok) {
      check('with its timestamp parsed', levy.value.at instanceof Date);
    }

    // The advance is a parameter because the server does not hold one, and the
    // balance is *negative* when the driver is out of pocket — flooring it at
    // zero would hide exactly the number they care about.
    const ledger = await api.levies(tripId, 400_000);
    check('the ledger reads back', ledger.ok, ledger.ok ? '' : ledger.failure.detail);
    if (ledger.ok) {
      check(
        'and the balance goes negative when they are out of pocket',
        ledger.value.balanceKobo < 0,
        String(ledger.value.balanceKobo),
      );
    }
  }

  {
    // Nothing captured yet is a 404 on the wire and `null` in the client: a
    // delivery that has not been started is the normal state of every trip.
    const none = await api.delivery(tripId);
    check('an uncaptured delivery is null rather than a failure', none.ok && none.value === null);

    const draft = await api.saveDelivery(tripId, {
      at: at(230),
      photoIds: ['p0', 'p1'],
      signatureName: 'Ibrahim Sani',
      signatureRole: 'storekeeper',
      signatureImageId: 's1',
      note: '',
    });
    check('a delivery draft saves', draft.ok, draft.ok ? '' : draft.failure.detail);
    if (draft.ok) {
      check('and says whether it can be sealed', typeof draft.value.canSeal === 'boolean');
    }
  }

  {
    // What a corridor is drawn from, as against the summary a chip is drawn
    // from. The claim is the same one the summary makes and stronger: run the
    // server's own fixes back through the TypeScript cleaner and demand the
    // same verdict on each.
    const fixes = await api.fixes(tripId);
    check('the cleaned fixes read back', fixes.ok, fixes.ok ? '' : fixes.failure.detail);
    if (fixes.ok) {
      check('with two kept and one thrown away', fixes.value.kept.length === 2 && fixes.value.dropped.length === 1);
      check('every fix carrying its accuracy', fixes.value.kept.every((f) => f.accuracy > 0));
      check(
        'and the reason the tower fix went',
        fixes.value.dropped[0]?.problem === 'implausible_jump',
        fixes.value.dropped[0]?.problem,
      );
    }

    const pack = await api.disputePack(tripId);
    check('the dispute pack assembles', pack.ok, pack.ok ? '' : pack.failure.detail);
    if (pack.ok) {
      check('with a sentence that counts rather than judges', pack.value.describe.includes('measured'));
      check('and position runs carrying an interval', pack.value.items.some((item) => item.until !== null));
    }

    const off = await api.deviation(tripId);
    check('deviation answers', off.ok, off.ok ? '' : off.failure.detail);
    // No route was declared on this trip, so the honest answer is that there
    // is nothing to be off — not a reassuring tick.
    check('and says unknown rather than on course with no route', off.ok && off.value.kind === 'unknown');
  }

  {
    // Money needs terms, and a trip that has none says so rather than
    // answering with a schedule of zeroes.
    const before = await api.escrow(tripId);
    check('escrow refuses a trip with no terms', !before.ok);

    const terms = await api.saveTerms(tripId, {
      truck: 'trailer_30t',
      agreedKobo: 224_000_000,
      acceptedAt: at(-60),
      distanceM: 830_000,
      driverPayKobo: 18_000_000,
      driverAdvanceKobo: 8_000_000,
      driverPaidAt: null,
    });
    check('terms save', terms.ok, terms.ok ? '' : terms.failure.detail);

    const escrow = await api.escrow(tripId);
    check('and then escrow answers', escrow.ok, escrow.ok ? '' : escrow.failure.detail);
    if (escrow.ok) {
      check('with all four milestones', escrow.value.releases.length === 4);
      check('and a naira string beside every kobo figure', escrow.value.agreedNaira.startsWith('₦'));
    }

    const cancelling = await api.cancellation(tripId, 'shipper');
    check('cancellation answers', cancelling.ok, cancelling.ok ? '' : cancelling.failure.detail);

    const costs = await api.costs(tripId, { dieselPerLitreKobo: 125_000, offeredKobo: 224_000_000 });
    check('costs answer', costs.ok, costs.ok ? '' : costs.failure.detail);
    if (costs.ok) {
      check('with the levies that were actually recorded', costs.value.leviesKobo === 500_000, String(costs.value.leviesKobo));
      check('and a verdict on the fare', costs.value.margin !== null);
    }
  }

  {
    const from = new Date(Date.now() - 365 * 86_400_000);
    const to = new Date(Date.now() + 86_400_000);

    const statement = await api.earnings(from, to);
    check('a statement reads back', statement.ok, statement.ok ? '' : statement.failure.detail);
    if (statement.ok) {
      check('with its window parsed', statement.value.from instanceof Date);
    }

    const alerts = await api.alerts(12);
    check('alerts read back', alerts.ok, alerts.ok ? '' : alerts.failure.detail);
    if (alerts.ok) {
      check('and carry an urgency', alerts.value.alerts.every((a) => a.urgency !== ''));
    }

    const papers = await api.verification();
    check('verification reads back', papers.ok, papers.ok ? '' : papers.failure.detail);

    const trucks = await api.vehicles();
    check('vehicles read back', trucks.ok, trucks.ok ? '' : trucks.failure.detail);

    const lanes = await api.lanes();
    check('lanes read back', lanes.ok, lanes.ok ? '' : lanes.failure.detail);

    const record = await api.record(DRIVER_ID, 'carrier');
    check('a record reads back', record.ok, record.ok ? '' : record.failure.detail);
    if (record.ok) {
      check('with a tally per question', record.value.tallies.length === 4);
    }
  }

  {
    const board = await api.loads();
    check('the load board reads back', board.ok, board.ok ? '' : board.failure.detail);
    if (board.ok && board.value.length > 0) {
      // The coordinates travel: "going your way" is a claim about exactly
      // these four numbers, and a client that cannot place a load cannot
      // price the haul or check the ranking.
      const first = board.value[0];
      check(
        'and every load carries where it starts and ends',
        first !== undefined && Number.isFinite(first.load.originLat),
      );
    }

    const pairs = await api.pairs('trailer_30t');
    check('pairs read back', pairs.ok, pairs.ok ? '' : pairs.failure.detail);

    const refused = await api.pairRefusals('trailer_30t');
    check('pair refusals read back', refused.ok, refused.ok ? '' : refused.failure.detail);

    const mine = await api.myLoads();
    check('a shipper\'s own loads read back', mine.ok, mine.ok ? '' : mine.failure.detail);

    const priced = await api.quote('trailer_30t', 830_000);
    check('a quote reads back', priced.ok, priced.ok ? '' : priced.failure.detail);
    if (priced.ok) {
      check('as a range, never a single number', priced.value.low < priced.value.high);
      check('and marked indicative, so no screen can render it as a price', priced.value.isIndicative);
    }
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
