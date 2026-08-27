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
   * When it stopped happening, for anything that spans time.
   *
   * A run of position fixes is an *interval*, not an instant. Treating it as
   * an instant made the gap finder report a hole between every pair of
   * consecutive items — a trip with continuous coverage came out as nine gaps
   * totalling fifty-one hours, which is the opposite of what the record said.
   *
   * Absent for anything that genuinely happened at a moment: a signature, a
   * state change, a message.
   */
  readonly until?: Date;
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
  /**
   * How much time the tracker actually covered.
   *
   * The honest measure of how much there is to argue from. Counting *items*
   * stopped working the moment positions were assembled into runs: a
   * well-covered trip is a handful of long runs, and a badly covered one can
   * be a dozen short ones.
   */
  readonly coveredMs: number;
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

  const gaps = holes(items);

  const coveredMs = items
    .filter((item) => item.kind === 'position')
    .reduce((total, item) => total + ((item.until ?? item.at).getTime() - item.at.getTime()), 0);

  return { tripId, assembledAt, items, counts, gaps, coveredMs };
}

/**
 * Stretches with nothing recorded, **while there was supposed to be**.
 *
 * Two rules, and both were learned by looking at a rendered pack:
 *
 * 1. A run of fixes covers the time it spans. Treating it as an instant made
 *    every pair of consecutive items look like a hole — a trip with continuous
 *    coverage reported fifty-one hours of nothing.
 *
 * 2. **A gap before the tracker started is not a gap.** A trip is often open
 *    for a day before a truck loads: messages are exchanged, a bid is
 *    accepted, nothing is moving and nothing should be recorded. Counting that
 *    as missing evidence tells a shipper the record has holes in it when what
 *    it has is a beginning. Only the window between the first and last thing
 *    the tracker measured can contain a hole.
 */
function holes(
  items: readonly (Evidence & { readonly weight: Weight })[],
): readonly { readonly from: Date; readonly to: Date; readonly ms: number }[] {
  /*
    Only positions constitute coverage.

    Weighing "measured" is not the same thing: a `signal_lost` event is
    measured — the tracker raised it, no party could have written it — and it
    is precisely the *absence* of coverage. Using measured items to bound the
    window started the clock at the first signal-loss, sixteen hours before any
    position existed, and reported that as two holes.
  */
  const covering = items.filter((item) => item.kind === 'position');
  const first = covering[0];
  const last = covering.at(-1);
  if (first === undefined || last === undefined) return [];

  const closes = (last.until ?? last.at).getTime();
  const found: { from: Date; to: Date; ms: number }[] = [];
  let coveredTo = first.at;

  for (const item of items) {
    if (item.at.getTime() <= coveredTo.getTime()) {
      const ends = item.until ?? item.at;
      if (ends.getTime() > coveredTo.getTime()) coveredTo = ends;
      continue;
    }
    if (item.at.getTime() > closes) break;

    const ms = item.at.getTime() - coveredTo.getTime();
    if (ms >= GAP_MS) found.push({ from: coveredTo, to: item.at, ms });

    const ends = item.until ?? item.at;
    if (ends.getTime() > coveredTo.getTime()) coveredTo = ends;
  }

  return found;
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
 * The least tracked time a pack can hold and still be worth arguing from.
 *
 * Two hours. Below that, a delivery dispute is being settled from a handful of
 * fixes and whatever the two parties remember.
 */
export const MINIMUM_COVERED_MS = 2 * 60 * 60_000;

/**
 * Whether the pack is thin enough that somebody should be told before they
 * rely on it.
 *
 * Not "whether the claim is weak" — that is not this system's call. It is
 * whether there is enough here for two people to argue from at all.
 *
 * Measured in **covered time**, not in item count. Counting items said a trip
 * with two long, unbroken runs of positions had "not much here" while a badly
 * tracked one with a dozen fragments looked healthy.
 */
export function isThin(pack: Pack): boolean {
  return pack.coveredMs < MINIMUM_COVERED_MS || pack.items.length < 6;
}
