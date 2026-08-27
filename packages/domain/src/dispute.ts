/**
 * The bundle a disagreement is argued from.
 *
 * Everything the product has been careful about exists for this moment: the
 * append-only history, the fixes that were discarded and why, the message
 * written in a dead zone and delivered eleven hours later, the photograph
 * geotagged 600 m from the market. Individually each is a detail. Assembled in
 * one document, in time order, they are the reason a haulier and a cargo owner
 * can settle in an afternoon rather than in a year.
 *
 * The assembler has one rule: **it adds nothing and it decides nothing.** No
 * summary, no fault, no "the evidence suggests". It orders what happened and
 * says how confident each item is, and the humans do the rest. A platform that
 * adjudicates its own disputes is a platform both sides stop trusting.
 */

export type EvidenceKind =
  | 'trip_event'
  | 'position'
  | 'discarded_position'
  | 'message'
  | 'incident'
  | 'photo'
  | 'signature'
  | 'waypoint_visit'
  | 'share_link';

export interface Evidence {
  readonly kind: EvidenceKind;
  /** When it happened, as claimed by whoever produced it. */
  readonly at: Date;
  /**
   * When the server took it.
   *
   * Null for anything the server produced itself. The gap between the two is
   * itself evidence — it is how a late report is told from a late delivery.
   */
  readonly receivedAt: Date | null;
  readonly summary: string;
  /** Who or what produced it. */
  readonly source: 'shipper' | 'carrier' | 'driver' | 'system';
}

/**
 * How much weight an item can carry.
 *
 * Not a score and not a probability — three named tiers, because "0.72
 * confidence" on a photograph is a number nobody can defend in an argument.
 */
export type Weight =
  /** Produced by the tracker or the server. Neither party could have written it. */
  | 'measured'
  /** Produced by a person, timestamped by the server on arrival. */
  | 'attested'
  /** Produced by a person and delivered much later than it was written. */
  | 'late_attested';

/**
 * How long a gap between writing and arriving makes an item late.
 *
 * Two hours. Long enough to cover an ordinary dead zone; short enough that a
 * message written after the argument started and back-dated is visible as
 * exactly that.
 */
export const LATE_AFTER_MS = 2 * 60 * 60_000;

export function weigh(item: Evidence): Weight {
  if (item.source === 'system') return 'measured';
  if (item.receivedAt === null) return 'attested';

  const delay = item.receivedAt.getTime() - item.at.getTime();
  return delay >= LATE_AFTER_MS ? 'late_attested' : 'attested';
}

export interface Pack {
  readonly tripId: string;
  readonly assembledAt: Date;
  readonly items: readonly (Evidence & { readonly weight: Weight })[];
  readonly counts: Readonly<Record<Weight, number>>;
  /** Stretches with no evidence at all, which is a fact about the trip. */
  readonly gaps: readonly { readonly from: Date; readonly to: Date; readonly ms: number }[];
}

/**
 * How long a stretch with nothing in it is worth naming.
 *
 * Three hours. Shorter than that is a quiet afternoon; longer is a hole in the
 * record, and a hole is the thing both sides will point at.
 */
export const GAP_MS = 3 * 60 * 60_000;

/**
 * Assembles the pack.
 *
 * Ordered by when things **happened**, not by when they arrived — the pack is
 * a reconstruction of the trip, and sorting by arrival would put a driver's
 * dead-zone message after the delivery it preceded.
 */
export function assemble(
  tripId: string,
  evidence: readonly Evidence[],
  assembledAt: Date,
): Pack {
  const items = [...evidence]
    .sort((a, b) => {
      const happened = a.at.getTime() - b.at.getTime();
      if (happened !== 0) return happened;
      // Ties broken by arrival, so two things in the same minute keep the
      // order the server saw rather than an arbitrary one.
      return (a.receivedAt?.getTime() ?? 0) - (b.receivedAt?.getTime() ?? 0);
    })
    .map((item) => ({ ...item, weight: weigh(item) }));

  const counts: Record<Weight, number> = {
    measured: 0,
    attested: 0,
    late_attested: 0,
  };
  for (const item of items) counts[item.weight]++;

  const gaps: { from: Date; to: Date; ms: number }[] = [];
  for (let i = 1; i < items.length; i++) {
    const before = items[i - 1];
    const after = items[i];
    if (before === undefined || after === undefined) continue;
    const ms = after.at.getTime() - before.at.getTime();
    if (ms >= GAP_MS) gaps.push({ from: before.at, to: after.at, ms });
  }

  return { tripId, assembledAt, items, counts, gaps };
}

/**
 * One line describing what the pack contains.
 *
 * Deliberately arithmetic rather than judgement: counts and hours, with no
 * adjective anywhere. The moment this sentence contains "strong" or "weak" it
 * is the platform taking a side.
 */
export function describePack(pack: Pack): string {
  const total = pack.items.length;
  if (total === 0) return 'Nothing recorded on this trip.';

  const gapHours = Math.round(pack.gaps.reduce((sum, gap) => sum + gap.ms, 0) / 3_600_000);
  const measured = pack.counts.measured;
  const late = pack.counts.late_attested;

  const parts = [`${total} items, ${measured} of them measured by the tracker`];
  if (late > 0) parts.push(`${late} reported late`);
  if (gapHours > 0) parts.push(`${gapHours} hours with nothing recorded`);

  return `${parts.join('; ')}.`;
}

/**
 * Whether the pack is thin enough that somebody should be told before they
 * rely on it.
 *
 * Not "whether the claim is weak" — that is not this system's call. It is
 * whether there is enough here for two people to argue from at all.
 */
export function isThin(pack: Pack): boolean {
  return pack.counts.measured < 5 || pack.items.length < 8;
}
