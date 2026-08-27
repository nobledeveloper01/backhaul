/**
 * One truck, several deliveries.
 *
 * Most of what moves on these corridors is not one pallet to one address. A
 * distributor sends the same trailer to four markets in Kano; a manufacturer
 * drops at three depots on the way to a fourth. Treating that as four trips
 * gets the arithmetic wrong in both directions — four minimum fares for one
 * run, and four separate demurrage clocks on a truck that only waited once.
 *
 * A multi-drop trip is **one trip with an ordered list of drops**. The order
 * is what makes it tractable: a drop is done when the goods for it are signed
 * for, and what is left on the truck is everything after it.
 */

import { fromNaira, type Kobo } from './money.ts';
import type { Waypoint } from './waypoints.ts';

export interface Drop {
  readonly id: string;
  /** Where this one goes. Its own radius, like any waypoint. */
  readonly at: Waypoint;
  readonly consignee: string;
  /** What this drop is, in the words on the waybill. */
  readonly goods: string;
  /** Units, where the load is counted in units. Null when it is bulk. */
  readonly units: number | null;
  readonly weightKg: number;
  /** Signed for. Null until it is. */
  readonly deliveredAt: Date | null;
  /** Refused, short or damaged at this drop. */
  readonly exception: string | null;
}

/**
 * What each extra stop adds to the fare.
 *
 * ₦25,000. A drop is not free — it is a detour, a wait, a second set of
 * paperwork and often a second night — and a platform that prices four drops
 * as one delivery is a platform hauliers price around by refusing multi-drop
 * work. It is a flat fee rather than a percentage: the cost of stopping does
 * not scale with what is on the truck.
 */
export const PER_DROP: Kobo = fromNaira(25_000);

/**
 * The drops still on the truck, in the order they should be made.
 *
 * Order is preserved rather than re-optimised. A driver has loaded the trailer
 * in the order the drops were given — the last drop is at the front of the
 * box — and a route that reorders them at 4am is a route that requires
 * unloading the whole thing at the first stop.
 */
export function remainingDrops(drops: readonly Drop[]): readonly Drop[] {
  return drops.filter((drop) => drop.deliveredAt === null);
}

export function completed(drops: readonly Drop[]): readonly Drop[] {
  return drops.filter((drop) => drop.deliveredAt !== null);
}

/** Weight still aboard. What a weighbridge will read. */
export function weightAboard(drops: readonly Drop[]): number {
  return remainingDrops(drops).reduce((total, drop) => total + drop.weightKg, 0);
}

/**
 * The next drop.
 *
 * Null when the truck is empty, which is the signal that the trip may finish —
 * not the arrival at the last waypoint. A truck can be at the last address with
 * goods still on it, and a trip that closes on geography rather than on
 * signatures closes on the wrong thing.
 */
export function nextDrop(drops: readonly Drop[]): Drop | null {
  return remainingDrops(drops)[0] ?? null;
}

export function isComplete(drops: readonly Drop[]): boolean {
  return drops.length > 0 && remainingDrops(drops).length === 0;
}

/**
 * A drop delivered out of order.
 *
 * Not refused — a consignee who is closed is a real thing and a driver who
 * comes back tomorrow is doing the sensible thing. It is *recorded*, because
 * "delivered in the order loaded" is otherwise assumed by everybody reading
 * the document afterwards.
 */
export function outOfOrder(drops: readonly Drop[]): readonly Drop[] {
  const out: Drop[] = [];

  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i];
    if (drop?.deliveredAt === null || drop === undefined) continue;

    const earlierStillAboard = drops
      .slice(0, i)
      .some((earlier) => earlier.deliveredAt === null);

    if (earlierStillAboard) out.push(drop);
  }

  return out;
}

/**
 * What the drops add to the fare.
 *
 * The **first** drop is the delivery; every one after it is an extra. A trip
 * with one drop costs what a trip has always cost, which is what keeps this
 * from being a price rise wearing a feature's clothes.
 */
export function dropFee(drops: readonly Drop[]): Kobo {
  const extra = Math.max(0, drops.length - 1);
  return (extra * PER_DROP) as Kobo;
}

/** Where the truck is up to, in a sentence. */
export function describeProgress(drops: readonly Drop[]): string {
  const done = completed(drops).length;
  const total = drops.length;

  if (total === 0) return 'No drops on this trip.';
  if (done === total) return `All ${total} drops signed for.`;

  const next = nextDrop(drops);
  return `${done} of ${total} signed for · next ${next?.at.name ?? 'unknown'}`;
}

/**
 * Drops that were reached but not delivered.
 *
 * A truck that visited an address and left with the goods still on it has a
 * story to tell — closed, refused, nobody there — and the visit without the
 * signature is what makes somebody ask for it.
 */
export function visitedButUndelivered(
  drops: readonly Drop[],
  visitedWaypointIds: readonly string[],
): readonly Drop[] {
  return drops.filter(
    (drop) => drop.deliveredAt === null && visitedWaypointIds.includes(drop.at.id),
  );
}
