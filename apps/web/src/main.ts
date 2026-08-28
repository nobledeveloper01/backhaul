import { BackhaulApi, type SignedIn, type TripSummaryView } from '@backhaul/api';
import {
  NO_TRIP_FILTER,
  filterTrips,
  normalisePhone,
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
        problem.textContent = 'The code could not be sent. Try again.';
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

function chip(observation: string): HTMLElement {
  const words: Record<string, string> = {
    moving: 'Moving',
    stopped: 'Stopped',
    signal_lost: 'No signal',
    unknown: 'No data yet',
  };
  const tone =
    observation === 'moving' ? 'moving' : observation === 'stopped' ? 'stopped' : 'stale';
  return el('span', { class: `chip ${tone}` }, words[observation] ?? observation);
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
            const observation = trip.tracking
              ? trip.lastSeenAt === null
                ? 'unknown'
                : now.getTime() - trip.lastSeenAt.getTime() > 20 * 60_000
                  ? 'signal_lost'
                  : 'moving'
              : 'unknown';

            const tone =
              observation === 'moving' ? 'moving' : observation === 'unknown' ? 'stale' : 'stopped';

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

// --- start -----------------------------------------------------------------

if (localStorage.getItem(TOKEN_KEY) === null) signIn();
else trips();
