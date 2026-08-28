import { BackhaulApi, type SignedIn, type TripSummaryView } from '@backhaul/api';
import {
  NO_TRIP_FILTER,
  SIGNAL_LOST_AFTER_MS,
  distanceTravelled,
  eta,
  filterTrips,
  fixQuality,
  normalisePhone,
  observe,
  silentFor,
  type Observation,
  type TripSummary,
} from '@backhaul/domain';

/**
 * The shipper's console.
 *
 * The fourth face of one product, and the argument for every boundary this
 * codebase has held: the rules come from `@backhaul/domain` and the wire from
 * `@backhaul/api`, both unchanged, both compiled the same way they are for the
 * phone. Nothing here reimplements a rule and nothing here reimplements a
 * request. What is written below is *arrangement* — which is what a face is
 * supposed to be.
 *
 * No framework and no bundler. It is three views and a list; a build step
 * between a reviewer and the thing being reviewed would buy nothing at this
 * size, and the day it grows to a hundred modules the answer is a bundler and
 * this file is what it replaces.
 *
 * It is deliberately **not** the driver face. A driver's screen is 64 dp
 * targets and as close to zero interactions per trip as the feature allows,
 * on a phone, in the sun, with a queue behind them. That is a different
 * product wearing the same icon, and it does not belong on a desktop.
 */

const TOKEN_KEY = 'backhaul.web.token.v1';

const app = document.querySelector<HTMLElement>('#app');
if (app === null) throw new Error('no #app to render into');

/*
  The base URL is read from the page, not compiled in.

  A console served from a static host has to be told where its API is, and
  baking it into the bundle means a separate build per environment. One
  attribute on the page is the smaller thing.
*/
const api = new BackhaulApi(
  document.documentElement.dataset['api'] ?? 'http://127.0.0.1:5111',
  localStorage.getItem(TOKEN_KEY),
);

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function render(...nodes: Node[]): void {
  app!.replaceChildren(...nodes);
}

// --- signing in ------------------------------------------------------------

function signIn(): void {
  const phone = el('input', {
    type: 'tel',
    id: 'phone',
    autocomplete: 'tel',
    placeholder: '0803 123 4567',
  });
  const problem = el('p', { class: 'error', role: 'alert' });
  const send = el('button', { class: 'primary' }, 'Send me a code');

  send.addEventListener('click', () => {
    // The same normaliser the phone and the server use. Four people write one
    // number four ways and every one means the same shipper.
    const number = normalisePhone(phone.value);
    if (number === null) {
      problem.textContent = 'That is not a number this can reach.';
      return;
    }

    problem.textContent = '';
    send.setAttribute('disabled', 'true');

    void api.requestCode(number).then((result) => {
      send.removeAttribute('disabled');
      if (!result.ok) {
        /*
          The server's own sentence, not a generic one.

          It knows whether a code was just sent, whether too many have been
          asked for, or whether the number is one it cannot reach — and it
          answers "A code was just sent. Wait a moment before asking for
          another." with the number of milliseconds to wait. Replacing that
          with "The code could not be sent" throws away the only part a person
          can act on, and it is what this screen did until somebody sat in
          front of it and pressed the button twice.
        */
        problem.textContent = result.failure.detail;
        return;
      }
      enterCode(number, result.value.phone);
    });
  });

  render(
    el('h1', {}, 'Backhaul'),
    el(
      'div',
      { class: 'card stack' },
      el('h2', {}, 'What is your phone number?'),
      el('p', { class: 'muted' }, 'We will send you a code. There is no password to remember.'),
      el('label', { for: 'phone' }, 'Phone number'),
      phone,
      problem,
      send,
    ),
  );
  phone.focus();
}

function enterCode(phone: string, shown: string): void {
  const code = el('input', {
    type: 'text',
    id: 'code',
    inputmode: 'numeric',
    autocomplete: 'one-time-code',
    maxlength: '6',
  });
  const problem = el('p', { class: 'error', role: 'alert' });
  const go = el('button', { class: 'primary' }, 'Sign in');
  const back = el('button', { class: 'quiet' }, 'Use another number');

  back.addEventListener('click', signIn);

  go.addEventListener('click', () => {
    problem.textContent = '';
    go.setAttribute('disabled', 'true');

    void api.verifyCode(phone, code.value.trim()).then((result) => {
      go.removeAttribute('disabled');
      if (!result.ok) {
        // The server's own sentence. It knows whether the code was wrong,
        // expired, or the fourth wrong guess in a row, and a generic message
        // here would throw that away.
        problem.textContent = result.failure.detail;
        return;
      }
      held(result.value);
    });
  });

  render(
    el('h1', {}, 'Backhaul'),
    el(
      'div',
      { class: 'card stack' },
      el('h2', {}, 'Enter the code'),
      el('p', { class: 'muted' }, `Sent to ${shown}.`),
      el('label', { for: 'code' }, 'Six digits'),
      code,
      problem,
      el('div', { class: 'row' }, go, back),
    ),
  );
  code.focus();
}

function held(who: SignedIn): void {
  localStorage.setItem(TOKEN_KEY, who.token);
  api.setToken(who.token);
  trips();
}

// --- the list --------------------------------------------------------------

/**
 * Whether a failure means the session is over, and ends it if so.
 *
 * A 401 is not "could not reach the server". The first cut rendered every
 * failure the same way and offered *Try again* on a token that will never work
 * again — a dead end dressed as a retry, on the one screen a shipper opens
 * first. It happened the moment the API restarted and the in-memory store
 * forgot every token, which is a development accident and exactly what a real
 * expiry looks like from here.
 */
function expired(failure: { kind: string; status?: number }): boolean {
  if (failure.kind !== 'refused' || failure.status !== 401) return false;

  localStorage.removeItem(TOKEN_KEY);
  api.setToken(null);
  signIn();
  return true;
}

/**
 * One chip per `Observation`, and the table is exhaustive on purpose.
 *
 * It was a partial `Record<string, string>` with a `?? observation` fallback,
 * which printed the raw key `silent` on the first trip that went quiet — a
 * lookup table with a fallback is a table that never tells you it is missing
 * an entry. Typed against the union, the compiler is what notices when the
 * domain grows a sixth state.
 *
 * **Stale is grey, never red.** A gap in coverage is a fact about Nigerian
 * network infrastructure, not the driver's fault, and colouring it as an alarm
 * trains shippers to distrust drivers for something nobody controls. Only
 * `stalled` — stopped away from anywhere it should be — is amber.
 */
function chip(observation: Observation): HTMLElement {
  const words: Record<Observation, string> = {
    moving: 'Moving',
    stopped: 'Stopped',
    stalled: 'Not moving',
    silent: 'No signal',
    unknown: 'No data yet',
  };

  const tones: Record<Observation, string> = {
    moving: 'moving',
    stopped: 'stopped',
    stalled: 'stopped',
    silent: 'stale',
    unknown: 'stale',
  };

  return el('span', { class: `chip ${tones[observation]}` }, words[observation]);
}

/**
 * How long ago, in words.
 *
 * The age of everything is shown and stale is grey — a gap in coverage is a
 * fact about Nigerian network infrastructure, not the driver's fault, and
 * colouring it as an alarm trains shippers to distrust drivers for something
 * nobody controls.
 */
function age(at: Date | null, now: Date): string {
  if (at === null) return 'no data yet';
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/**
 * The list's view of a trip, for the filter engine.
 *
 * The summary route carries a corridor, a state and an age and no cargo,
 * plate or driver — so those are empty here rather than invented. `matches`
 * against an empty string is false, which is the honest answer: a search for a
 * plate cannot find a trip whose plate this face has never been told.
 */
function toSummary(trip: TripSummaryView): TripSummary {
  return {
    id: trip.id,
    reference: `BH-${trip.id.slice(-4).toUpperCase()}`,
    state: trip.state,
    origin: trip.origin,
    destination: trip.destination,
    cargo: '',
    truckPlate: '',
    driverName: '',
    startedAt: trip.startedAt,
    hasOpenIncident: trip.hasOpenIncident,
    isLate: false,
  };
}

function trips(): void {
  render(el('h1', {}, 'On the road'), el('p', { class: 'muted' }, 'Loading…'));

  void api.trips().then((result) => {
    if (!result.ok) {
      if (expired(result.failure)) return;

      // Which of the five it is, not "no trips". A shipper reading "no trips"
      // on a bad connection concludes their trucks are idle.
      render(
        el('h1', {}, 'On the road'),
        el(
          'div',
          { class: 'card stack' },
          el('p', {}, 'Could not reach the server.'),
          el('p', { class: 'muted' }, result.failure.detail),
          (() => {
            const again = el('button', { class: 'primary' }, 'Try again');
            again.addEventListener('click', trips);
            return again;
          })(),
        ),
      );
      return;
    }

    list(result.value);
  });
}

function list(all: readonly TripSummaryView[]): void {
  const now = new Date();
  const search = el('input', { type: 'search', id: 'q', placeholder: 'Town, plate, cargo' });
  const rows = el('div', { class: 'stack' });

  const draw = () => {
    /*
      `filterTrips` is the domain's, which is the function the phone filters
      with and the one the server filters with. Three faces, one idea of what
      "lsr 482 xa" matches — it flattens case, accents and punctuation, because
      three people write the same plate three ways.

      Filtered here rather than by asking the server again: the list is
      already on this page, and a keystroke that costs a request is a search
      that stutters on a bad connection.
    */
    const text = search.value.trim();
    const kept = filterTrips(all.map(toSummary), { ...NO_TRIP_FILTER, text });
    const keep = new Set(kept.map((trip) => trip.id));
    const shown = all.filter((trip) => keep.has(trip.id));

    rows.replaceChildren(
      ...(shown.length === 0
        ? [el('p', { class: 'muted' }, text === '' ? 'Nothing on the road.' : 'Nothing matches that.')]
        : shown.map((trip) => {
            /*
              The list route carries an age, not a track, so this is the one
              place a judgement is made outside an engine — and it is kept to
              the same threshold `tracking.ts` uses for silence, named here
              rather than invented. `observe()` needs the recent fixes and the
              summary does not carry them; asking for every trip's track to
              draw a list of twenty is what the summary exists to avoid.
            */
            const observation: Observation =
              !trip.tracking || trip.lastSeenAt === null
                ? 'unknown'
                : now.getTime() - trip.lastSeenAt.getTime() > SIGNAL_LOST_AFTER_MS
                  ? 'silent'
                  : 'moving';

            const tone = observation === 'moving' ? 'moving' : 'stale';

            const card = el(
              'button',
              { class: `card trip ${tone}`, type: 'button' },
              el('div', { class: 'corridor' }, `${trip.origin} → ${trip.destination}`),
              el(
                'div',
                { class: 'row' },
                chip(observation),
                el('span', { class: 'label' }, age(trip.lastSeenAt, now)),
                ...(trip.hasOpenIncident
                  ? [el('span', { class: 'chip stopped' }, 'Needs a look')]
                  : []),
              ),
            );
            card.addEventListener('click', () => {
              window.location.hash = `#/trip/${trip.id}`;
            });
            return card;
          })),
    );
  };

  search.addEventListener('input', draw);

  const out = el('button', { class: 'quiet' }, 'Sign out');
  out.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    api.setToken(null);
    signIn();
  });

  render(
    el('div', { class: 'row' }, el('h1', {}, 'On the road'), out),
    el('label', { for: 'q' }, 'Search'),
    search,
    el('p', { class: 'label' }, `${all.length} trip${all.length === 1 ? '' : 's'}`),
    rows,
  );
  draw();
}

// --- one trip ---------------------------------------------------------------

/**
 * A trip, as the shipper sees it.
 *
 * Six reads, and every figure on the page comes out of an engine rather than
 * out of this file: `observe` says whether it is moving, `eta` says when it
 * arrives or refuses to, `fixQuality` says how much of the track survived
 * cleaning and `distanceTravelled` sums what is left. Nothing here decides
 * anything.
 */
function trip(id: string): void {
  render(el('h1', {}, 'Trip'), el('p', { class: 'muted' }, 'Loading…'));

  void Promise.all([api.trip(id), api.fixes(id), api.deviation(id)]).then(
    ([held, track, drift]) => {
      if (!held.ok) {
        if (expired(held.failure)) return;

        render(
          backLink(),
          el(
            'div',
            { class: 'card stack' },
            el('p', {}, 'Could not open that trip.'),
            el('p', { class: 'muted' }, held.failure.detail),
          ),
        );
        return;
      }

      const now = new Date();
      const cleaned = track.ok ? track.value : { kept: [], dropped: [] };
      const observation = observe(cleaned.kept, now);
      const silent = silentFor(cleaned.kept, now);

      /*
        The destination is the last fix's own position when there is nothing
        better, which makes the arrival estimate refuse rather than lie. The
        summary route carries a corridor by name and no coordinates, and
        inventing one from a town name is the sort of guess this product does
        not make — it would produce a confident figure from nothing.
      */
      const last = cleaned.kept.at(-1);
      const arrival =
        last === undefined
          ? null
          : eta({
              track: cleaned.kept,
              destination: last,
              now,
              incidents: [],
            });

      const events = held.value.history;
      const state = events.at(-1)?.state ?? held.value.state;

      render(
        backLink(),
        el('h1', {}, `BH-${id.slice(-4).toUpperCase()}`),

        el(
          'div',
          { class: 'card stack' },
          el('h2', {}, 'Where it is'),
          el(
            'div',
            { class: 'row' },
            chip(observation),
            el('span', { class: 'label' }, silent === null
              ? 'no data yet'
              : `last heard ${age(last?.at ?? null, now)}`),
          ),
          el('p', { class: 'label' }, `State: ${state.replace('_', ' ')}`),
        ),

        el(
          'div',
          { class: 'card stack' },
          el('h2', {}, 'Arrival'),
          arrival === null || arrival.kind === 'unknown'
            ? el(
                'p',
                { class: 'muted' },
                arrival?.detail ?? 'No positions yet. An estimate appears once the truck starts.',
              )
            : el(
                'div',
                {},
                el('p', { class: 'corridor' }, `${clock(arrival.earliest)} – ${clock(arrival.latest)}`),
                // Never silently. An estimate built from a class average
                // rather than this truck's own pace says so, beside the
                // figure — the measured/modelled rule does not stop at the
                // edge of the engine.
                arrival.isModelled
                  ? el('span', { class: 'chip stopped' }, 'Estimated')
                  : el('span', { class: 'label' }, "from this truck's own pace"),
              ),
        ),

        el(
          'div',
          { class: 'card stack' },
          el('h2', {}, 'The track'),
          el(
            'p',
            {},
            `${Math.round(distanceTravelled(cleaned) / 1000)} km travelled, `
              + `${cleaned.kept.length} position${cleaned.kept.length === 1 ? '' : 's'} kept`,
          ),
          // What was thrown away and why. A driver whose distance is disputed
          // is owed the answer to "what did you discard?", and a track that is
          // 40% dropped is a broken phone somebody should replace.
          el(
            'p',
            { class: 'label' },
            cleaned.dropped.length === 0
              ? 'Nothing was discarded.'
              : `${cleaned.dropped.length} discarded — ${Math.round(fixQuality(cleaned) * 100)}% usable`,
          ),
          /*
            `unknown` is not `on_course`, and the difference is the whole
            point of the field. A console that showed nothing for both would
            tell a shipper their truck is fine when the truth is that nobody
            can say — the server's own sentence is rendered rather than a
            verdict this file invents.
          */
          ...(drift.ok && drift.value.kind === 'deviating'
            ? [
                el(
                  'p',
                  { class: 'chip stopped' },
                  drift.value.detail ?? 'Moving away from where it is going',
                ),
              ]
            : []),
        ),

        el(
          'div',
          { class: 'card stack' },
          el('h2', {}, 'What happened'),
          ...events
            .slice()
            .reverse()
            .map((event) =>
              el(
                'p',
                { class: 'label' },
                `${event.state.replace('_', ' ')} — ${age(event.at, now)}, by the ${event.actor}`,
              ),
            ),
        ),
      );
    },
  );
}

function clock(at: Date): string {
  return at.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function backLink(): HTMLElement {
  const back = el('button', { class: 'quiet' }, '‹ All trips');
  back.addEventListener('click', () => {
    window.location.hash = '';
  });
  return back;
}

// --- start -----------------------------------------------------------------

/**
 * One route, read from the hash.
 *
 * A hash rather than a path because this is a static bundle: a real path needs
 * the host to rewrite every unknown URL back to `index.html`, and a console
 * that 404s when somebody refreshes on a trip is worse than one with a `#` in
 * the address bar.
 */
function route(): void {
  if (localStorage.getItem(TOKEN_KEY) === null) {
    signIn();
    return;
  }

  const match = /^#\/trip\/(.+)$/.exec(window.location.hash);
  if (match?.[1] !== undefined) trip(match[1]);
  else trips();
}

window.addEventListener('hashchange', route);
route();
