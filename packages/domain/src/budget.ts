/**
 * What the tracking costs the person carrying it.
 *
 * A driver did not choose this app. They are paid whether or not they use it,
 * and they are buying their own data — on a corridor where a gigabyte is a
 * meaningful fraction of a day's earnings. An app that quietly spends their
 * airtime is an app that gets force-quit, and a force-quit trip is a trip with
 * no evidence.
 *
 * So the cost is computed and **shown**, in naira, on the driver's own screen.
 * The same instinct as the battery line beside it: a driver who can see why
 * their phone is doing something leaves it alone.
 */

import { fromNaira, type Kobo } from './money.ts';
import type { SampleInterval } from './tracking.ts';

/**
 * Bytes on the wire for one position sample.
 *
 * Measured against the real request body, not guessed: id, lat, lon, accuracy,
 * an ISO timestamp, speed and battery, as JSON with the field names the API
 * actually uses, plus its share of the comma and brackets. 180 is that,
 * rounded up.
 *
 * Rounded **up** on purpose. Every figure here is a bill somebody pays, and a
 * bill that comes in under the estimate is a good surprise.
 */
export const BYTES_PER_SAMPLE = 180;

/**
 * The overhead of one upload, whatever it carries.
 *
 * TLS handshake amortised, HTTP/2 headers, the batch envelope and the
 * acknowledgement coming back. 1,400 bytes — about one packet, which is the
 * right order for a request that is mostly ceremony.
 */
export const BYTES_PER_BATCH = 1_400;

/**
 * What a megabyte costs, in kobo.
 *
 * ₦0.35/MB — roughly a ₦350 gigabyte, which is what a Nigerian prepaid daily
 * or weekly bundle works out at. Not a constant of nature: it is a number that
 * moves, it is here rather than in a screen so it moves in one place, and it is
 * why `estimateCost` takes it as an argument with this only as the default.
 */
export const KOBO_PER_MB = 35;

export interface Usage {
  readonly samples: number;
  readonly batches: number;
  readonly bytes: number;
}

export function usage(samples: number, batches: number): Usage {
  return {
    samples,
    batches,
    bytes: samples * BYTES_PER_SAMPLE + batches * BYTES_PER_BATCH,
  };
}

/** What that usage costs. */
export function estimateCost(used: Usage, koboPerMb: number = KOBO_PER_MB): Kobo {
  const megabytes = used.bytes / 1_048_576;
  // Rounded up to the kobo, so nothing is ever quoted as free that is not.
  return Math.ceil(megabytes * koboPerMb) as Kobo;
}

/**
 * What a day of tracking costs at a given cadence.
 *
 * The figure that answers the question a driver actually asks — not "how much
 * have I spent", which they cannot act on, but "what is this going to cost me",
 * which they can.
 *
 * Batches are assumed at the upload cadence rather than one per sample: the
 * tracker buffers, and pretending otherwise would overstate the cost by a
 * factor of four and frighten somebody off a thing that is nearly free.
 */
export function dailyCost(options: {
  readonly interval: SampleInterval;
  readonly uploadEveryMs: number;
  readonly koboPerMb?: number;
}): { readonly used: Usage; readonly cost: Kobo } {
  const day = 24 * 60 * 60_000;
  // `SampleInterval` is the interval itself, in seconds — not a key into
  // `INTERVAL`. Indexing the table with it typechecked as an error rather than
  // silently producing `undefined`, which is the whole reason the ladder's
  // values are a union type instead of numbers.
  const samples = Math.round(day / (options.interval * 1_000));
  const batches = Math.round(day / options.uploadEveryMs);
  const used = usage(samples, batches);

  return { used, cost: estimateCost(used, options.koboPerMb) };
}

/**
 * A size a person can read.
 *
 * kB below a megabyte, one decimal place above it. Never bytes: nobody has
 * ever made a decision differently because a number was 1,048,576 rather than
 * "1.0 MB".
 */
export function describeBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1_024)} kB`;
  return `${(Math.round((bytes / 1_048_576) * 10) / 10).toFixed(1)} MB`;
}

/**
 * The whole thing, in one sentence for the driver's screen.
 *
 * Written here rather than in the screen because it is the sentence the
 * feature exists to say, and a screen that assembles it from three numbers can
 * assemble it wrongly.
 */
export function describeCost(used: Usage, cost: Kobo): string {
  const naira = cost / 100;
  // "₦0" reads as a bug or as a promise, and neither is true.
  const money = naira < 1 ? 'under ₦1' : `about ₦${Math.round(naira)}`;
  return `${describeBytes(used.bytes)} of data so far — ${money} of your airtime.`;
}

/**
 * A month at the same rate.
 *
 * The figure worth putting on the screen, because the daily one is too small
 * to be legible: **at current prices a day of tracking costs a driver about
 * fifteen kobo.** That is the answer to the fear, and it is only convincing
 * when it is arithmetic somebody can follow rather than a reassurance.
 *
 * Writing this engine is what established that the data cost is negligible and
 * the *battery* is the real price a driver pays. The tracking ladder in
 * `tracking.ts` is spent in the right place.
 */
export function monthlyCost(daily: Kobo): Kobo {
  return (daily * 30) as Kobo;
}

export function describeMonthly(daily: Kobo): string {
  const naira = monthlyCost(daily) / 100;
  return naira < 1
    ? 'Under ₦1 a month at this rate.'
    : `About ₦${Math.round(naira)} a month at this rate.`;
}

/**
 * Whether the cost has reached the point of saying something unprompted.
 *
 * ₦50 for a trip.
 *
 * **At today's prices and today's payload, nothing reaches it** — a three-day
 * Lagos–Kano run costs under a naira. It is here so that the app starts
 * telling drivers if either of those changes by an order of magnitude: a
 * payload that grows, a price that spikes, or a future feature that uploads
 * photographs on the driver's own bundle. A guard that never fires today is
 * the cheapest kind to have written.
 */
export const WORTH_MENTIONING: Kobo = fromNaira(50);

export function worthMentioning(cost: Kobo): boolean {
  return cost >= WORTH_MENTIONING;
}
