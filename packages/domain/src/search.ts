/**
 * Finding one trip in a list of four hundred, and one load in a board of
 * thousands.
 *
 * Both are the same shape of problem — a filter applied to a list, described in
 * words a person can read back — so both live here, and neither is a database
 * query. A fleet manager filters trips that are already on the phone; a carrier
 * filters a load board that is not, and the server runs the same predicate
 * against the same field names.
 */

import type { Kobo } from './money.ts';
import type { TripState } from './trip.ts';
import type { TruckClass } from './pricing.ts';

/**
 * What a trip looks like to a filter.
 *
 * A narrow view rather than the whole trip: everything here is either indexed
 * on the server or already on the phone, and a filter field that requires
 * loading a trip to evaluate is a filter that cannot run on a load board.
 */
export interface TripSummary {
  readonly id: string;
  readonly reference: string;
  readonly state: TripState;
  readonly origin: string;
  readonly destination: string;
  readonly cargo: string;
  readonly truckPlate: string;
  readonly driverName: string;
  readonly startedAt: Date;
  readonly hasOpenIncident: boolean;
  readonly isLate: boolean;
}

export interface TripFilter {
  /** Matched against reference, corridor, cargo, plate and driver. */
  readonly text: string;
  readonly states: readonly TripState[];
  readonly onlyLate: boolean;
  readonly onlyWithIncidents: boolean;
  readonly since: Date | null;
  readonly until: Date | null;
}

export const NO_TRIP_FILTER: TripFilter = {
  text: '',
  states: [],
  onlyLate: false,
  onlyWithIncidents: false,
  since: null,
  until: null,
};

/**
 * Whether a filter would change anything.
 *
 * Used to decide whether to show the "clear" affordance. A filter chip row that
 * is always visible teaches people to ignore it, and then somebody spends ten
 * minutes convinced their trips have vanished.
 */
export function isFiltering(filter: TripFilter): boolean {
  return (
    filter.text.trim().length > 0 ||
    filter.states.length > 0 ||
    filter.onlyLate ||
    filter.onlyWithIncidents ||
    filter.since !== null ||
    filter.until !== null
  );
}

/**
 * Case- and accent-insensitive, whitespace-tolerant containment.
 *
 * Plates are written `T-12345`, `T 12345` and `t12345` by three different
 * people about the same truck, and a search that finds none of them is a search
 * nobody uses twice.
 */
function matches(haystack: string, needle: string): boolean {
  const flatten = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/gi, '')
      .toLowerCase();
  return flatten(haystack).includes(flatten(needle));
}

export function filterTrips(
  trips: readonly TripSummary[],
  filter: TripFilter,
): readonly TripSummary[] {
  const text = filter.text.trim();

  return trips.filter((trip) => {
    if (filter.states.length > 0 && !filter.states.includes(trip.state)) return false;
    if (filter.onlyLate && !trip.isLate) return false;
    if (filter.onlyWithIncidents && !trip.hasOpenIncident) return false;
    if (filter.since !== null && trip.startedAt.getTime() < filter.since.getTime()) return false;
    if (filter.until !== null && trip.startedAt.getTime() > filter.until.getTime()) return false;

    if (text.length === 0) return true;

    return (
      matches(trip.reference, text) ||
      matches(trip.origin, text) ||
      matches(trip.destination, text) ||
      matches(trip.cargo, text) ||
      matches(trip.truckPlate, text) ||
      matches(trip.driverName, text)
    );
  });
}

/**
 * The filter, as a sentence.
 *
 * Rendered above the results. A row of chips tells somebody *that* a filter is
 * on; a sentence tells them *which*, and the difference matters when the answer
 * on screen is "no trips".
 */
export function describeTripFilter(filter: TripFilter): string {
  const parts: string[] = [];
  if (filter.text.trim().length > 0) parts.push(`matching "${filter.text.trim()}"`);
  if (filter.states.length > 0) parts.push(filter.states.join(', ').replace(/_/g, ' '));
  if (filter.onlyLate) parts.push('running late');
  if (filter.onlyWithIncidents) parts.push('with an open incident');

  /*
    The dates were missing from this sentence and present in `isFiltering`.

    A shipper who narrowed to "since Monday" saw "All trips" above a list that
    was plainly not all of them — which is precisely the ten minutes of
    confusion the sentence exists to prevent. Found by reading the fixture
    output, not by a failing test: both halves were internally consistent and
    disagreed with each other.

    Written as a day and a month rather than a full date, because it sits in a
    line beside a count and a full ISO date would be the longest thing on it.
  */
  if (filter.since !== null) parts.push(`from ${dayAndMonth(filter.since)}`);
  if (filter.until !== null) parts.push(`up to ${dayAndMonth(filter.until)}`);

  if (parts.length === 0) return 'All trips';
  return `Trips ${parts.join(', ')}`;
}

/** "04/03". Figures rather than a month name: this app is read in four languages. */
function dayAndMonth(when: Date): string {
  const day = String(when.getUTCDate()).padStart(2, '0');
  const month = String(when.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

/** What a load looks like on the board. */
export interface LoadSummary {
  readonly id: string;
  readonly origin: string;
  readonly destination: string;
  readonly cargo: string;
  readonly weightKg: number;
  readonly offered: Kobo;
  readonly readyFrom: Date;
  readonly truckClass: TruckClass;
  /**
   * The shipper's standing, or null when nobody has established one.
   *
   * **Null, because this product does not have a shipper ladder yet.** `trust.ts`
   * is carrier-shaped — a driver's licence, goods-in-transit cover, punctuality
   * — and none of that is what makes a shipper worth working for. That is
   * whether they pay, and on time, which is a different set of requirements
   * nobody has written.
   *
   * The server used to fill this with the literal `'verified'` on every load,
   * from two places, each with a comment saying the real thing was one line
   * away. It was not one line away; it was a decision nobody had taken. Null
   * says so, and a carrier filtering on tier sees nothing rather than seeing
   * everything wearing a badge the platform invented.
   */
  readonly shipperTier: string | null;
}

export interface LoadFilter {
  readonly text: string;
  readonly truckClasses: readonly TruckClass[];
  readonly minimumOffer: Kobo | null;
  readonly readyBefore: Date | null;
  /** Only loads from shippers at or above these tiers. */
  readonly tiers: readonly string[];
}

export const NO_LOAD_FILTER: LoadFilter = {
  text: '',
  truckClasses: [],
  minimumOffer: null,
  readyBefore: null,
  tiers: [],
};

export function filterLoads(
  loads: readonly LoadSummary[],
  filter: LoadFilter,
): readonly LoadSummary[] {
  const text = filter.text.trim();

  return loads.filter((load) => {
    if (filter.truckClasses.length > 0 && !filter.truckClasses.includes(load.truckClass)) {
      return false;
    }
    if (filter.minimumOffer !== null && load.offered < filter.minimumOffer) return false;
    if (filter.readyBefore !== null && load.readyFrom.getTime() > filter.readyBefore.getTime()) {
      return false;
    }
    // An unestablished standing matches no tier filter. Excluded rather than
    // admitted: a carrier who asked for Trusted shippers and got everybody
    // has been told something false about all of them.
    if (filter.tiers.length > 0) {
      if (load.shipperTier === null || !filter.tiers.includes(load.shipperTier)) return false;
    }

    if (text.length === 0) return true;

    return (
      matches(load.origin, text) || matches(load.destination, text) || matches(load.cargo, text)
    );
  });
}

/**
 * What to say when a filter finds nothing.
 *
 * Names the narrowest condition rather than saying "no results", because the
 * useful next action is to relax *that one*. An empty state that does not say
 * what to change is a dead end, and every error path here has a forward path.
 */
export function whyNothing(filter: LoadFilter): string {
  if (filter.minimumOffer !== null) return 'No loads at that price. Try a lower figure.';
  if (filter.truckClasses.length > 0) return 'No loads for that truck. Try another class.';
  if (filter.readyBefore !== null) return 'No loads ready by then. Try a later date.';
  if (filter.tiers.length > 0) return 'No loads from shippers at that level yet.';
  if (filter.text.trim().length > 0) return `Nothing matching "${filter.text.trim()}".`;
  return 'No loads on the board right now.';
}
