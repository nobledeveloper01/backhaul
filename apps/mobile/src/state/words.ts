import type {
  AlertKind,
  Blocker,
  Cadence,
  LoadFilter,
  CarrierClaim,
  ExceptionKind,
  IncidentKind,
  LevyKind,
  Paper,
  Phrase,
  Tier,
  TruckClass,
  Standing,
} from '@backhaul/domain';

import type { Words } from '../components/PositionAge';

/**
 * The reader's words for a domain enum.
 *
 * `packages/domain` writes its labels in English, and that is right: they are
 * what the server says, what the parity fixtures pin character for character,
 * and what an API consumer reads. But the app is read in four languages, and a
 * screen that renders `describeLevy(kind)` puts "Police checkpoint" in the
 * middle of a Yorùbá list.
 *
 * So the enum crosses the boundary and the words do not. Every map here is
 * exhaustive by type: adding a levy kind to the domain breaks this file, which
 * is the only way a new kind gets its four translations rather than silently
 * appearing in English.
 */

export const LEVY_WORDS: Readonly<Record<LevyKind, Phrase>> = {
  police: 'levy_police',
  state_revenue: 'levy_state_revenue',
  union: 'levy_union',
  weighbridge: 'levy_weighbridge',
  park: 'levy_park',
  ferry: 'levy_ferry',
  other: 'levy_other',
};

export const PAPER_WORDS: Readonly<Record<Paper, Phrase>> = {
  licence: 'paper_licence',
  roadworthiness: 'paper_roadworthiness',
  insurance: 'paper_insurance',
  permit: 'paper_permit',
};

export const TIER_WORDS: Readonly<Record<Tier, Phrase>> = {
  unverified: 'tier_unverified',
  verified: 'tier_verified',
  business: 'tier_business',
  trusted: 'tier_trusted',
};

export const INCIDENT_WORDS: Readonly<Record<IncidentKind, Phrase>> = {
  breakdown: 'broken_down',
  security: 'security',
  accident: 'accident',
  detained: 'held_up',
  road: 'road_blocked',
  cargo: 'the_load',
};

export const TRUCK_WORDS: Readonly<Record<TruckClass, Phrase>> = {
  pickup: 'truck_pickup',
  canter: 'truck_canter',
  truck_15t: 'truck_15t',
  trailer_30t: 'truck_30t',
  lowbed: 'truck_lowbed',
};

export const STANDING_WORDS: Readonly<Record<Standing, Phrase>> = {
  road_legal: 'road_legal',
  expiring: 'papers_expiring',
  lapsed: 'papers_lapsed',
  incomplete: 'papers_missing',
  retired: 'standing_retired',
};

export const EXCEPTION_WORDS: Readonly<Record<ExceptionKind, Phrase>> = {
  short: 'exception_short',
  damaged: 'exception_damaged',
  refused: 'exception_refused',
};

export const ALERT_WORDS: Readonly<Record<AlertKind, Phrase>> = {
  signal_lost: 'alert_signal_lost',
  stalled: 'alert_stalled',
  deviating: 'alert_deviating',
  late: 'alert_late',
  incident: 'alert_incident',
  duress: 'alert_duress',
  delivered: 'alert_delivered',
  bid_received: 'alert_bid_received',
  link_expiring: 'alert_link_expiring',
};

export const CADENCE_WORDS: Readonly<Record<Cadence, Phrase>> = {
  weekly: 'cadence_weekly',
  fortnightly: 'cadence_fortnightly',
  monthly: 'cadence_monthly',
  ad_hoc: 'cadence_ad_hoc',
};

/** The question a reviewer answers. */
export const CARRIER_QUESTIONS: Readonly<Record<CarrierClaim, Phrase>> = {
  arrived_to_load: 'ask_arrived_to_load',
  reachable: 'ask_reachable',
  cargo_intact: 'ask_cargo_intact',
  no_extras: 'ask_no_extras',
};

/** The short version, on somebody's record. */
export const CARRIER_CLAIM_WORDS: Readonly<Record<CarrierClaim, Phrase>> = {
  arrived_to_load: 'claim_arrived_to_load',
  reachable: 'claim_reachable',
  cargo_intact: 'claim_cargo_intact',
  no_extras: 'claim_no_extras',
};

/**
 * Sentences the domain composes in English, rebuilt in the reader's language.
 *
 * `packages/domain` writes each of these as one string with the numbers already
 * in it — which is right for the server and for the parity fixtures, and wrong
 * for a screen read in four languages. The engine still decides *what* to say;
 * these decide *how*, from the same figures.
 *
 * Every one of them puts the count first and the phrase after, for the reason
 * `humanDuration` gives: the middle of a sentence is somewhere different in
 * each of these four languages.
 */

/** The line under a ranked load. Mirrors `matching.explain`. */
export function whyThisLoad(
  deadheadM: number,
  progressHomeM: number,
  hasBase: boolean,
  t: Words,
): string {
  const empty = `${Math.round(deadheadM / 1000)} ${t('km_empty_to_pickup')}`;
  if (!hasBase) return `${empty}.`;
  if (progressHomeM > 50_000) {
    return `${empty} · ${Math.round(progressHomeM / 1000)} ${t('of_the_run_home')}.`;
  }
  if (progressHomeM < -50_000) {
    return `${empty} · ${Math.round(-progressHomeM / 1000)} ${t('further_from_base')}.`;
  }
  return `${empty} · ${t('neither_toward_nor_away')}.`;
}

/** Whether a fare is worth taking. Mirrors `costs.advise`. */
export function whyThisFare(
  take: boolean,
  fraction: number | null,
  belowFloor: boolean,
  t: Words,
): string {
  if (!take && !belowFloor) return t('loses_money');
  if (!take) return t('covers_the_trip_only');
  return `${Math.round((fraction ?? 0) * 100)}% ${t('over_what_the_run_costs')}`;
}

/** How far through the drops. Mirrors `drops.describeProgress`. */
export function whereTheDropsAre(
  done: number,
  total: number,
  nextName: string | null,
  t: Words,
): string {
  if (total === 0) return t('no_drops_on_this_trip');
  if (done === total) return `${total} ${t('all_drops_signed_for')}`;
  return `${done}/${total} ${t('signed_for_next')} ${nextName ?? '—'}`;
}

/** Why a filter found nothing. Mirrors `search.whyNothing`. */
export function whyNoLoads(filter: LoadFilter, t: Words): string {
  if (filter.minimumOffer !== null) return t('no_loads_at_that_price');
  if (filter.truckClasses.length > 0) return t('no_loads_for_that_truck');
  if (filter.readyBefore !== null) return t('no_loads_ready_by_then');
  if (filter.tiers.length > 0) return t('no_loads_from_that_level');
  if (filter.text.trim().length > 0) return `${t('nothing_matching')} "${filter.text.trim()}".`;
  return t('no_loads_right_now');
}

/** When a lane comes round. Mirrors `lanes.describeDue`. */
export function whenDue(remainingMs: number | null, cadence: Cadence, t: Words): string {
  if (remainingMs === null) return t(CADENCE_WORDS[cadence]);

  const days = Math.round(remainingMs / 86_400_000);
  if (days < 0) return `${Math.abs(days)} ${t('days_overdue')}`;
  if (days === 0) return t('due_today');
  if (days === 1) return t('due_tomorrow');
  return `${days} ${t('due_in_days')}`;
}

/** What the pack contains. Mirrors `dispute.describePack`. */
export function whatThePackHolds(
  total: number,
  measured: number,
  late: number,
  gapHours: number,
  t: Words,
): string {
  if (total === 0) return t('nothing_recorded_on_trip');

  const parts = [`${total} ${t('items_measured_by_tracker')}: ${measured}`];
  if (late > 0) parts.push(`${late} ${t('reported_late_count')}`);
  if (gapHours > 0) parts.push(`${gapHours} ${t('hours_with_nothing')}`);

  return `${parts.join('; ')}.`;
}

/** Why a load cannot be taken. Mirrors `matching.explainBlocker`. */
export const BLOCKER_WORDS: Readonly<Record<Blocker, Phrase>> = {
  too_heavy: 'blocker_too_heavy',
  wrong_class: 'blocker_wrong_class',
  expired: 'blocker_expired',
  cannot_reach: 'blocker_cannot_reach',
};

/**
 * The server's refusal codes, in the reader's words.
 *
 * The server sends a code and a sentence. The sentence is English — it is what
 * an API consumer reads and what the parity fixtures hold both implementations
 * to, character for character — so a screen renders from the code instead.
 *
 * `refusalWords` falls back to the server's own sentence for a code this app
 * has not seen. That is deliberate and it is the honest failure: English words
 * that are *true* beat translated words that are a guess, and the fallback is
 * visible in a way that a silent "something went wrong" would not be.
 */
const REFUSAL_WORDS: Readonly<Record<string, Phrase>> = {
  not_a_number: 'refusal_not_a_number',
  too_many: 'refusal_too_many',
  too_soon: 'refusal_too_soon',
  unknown: 'refusal_unknown',
  expired: 'refusal_expired',
  exhausted: 'refusal_exhausted',
  used: 'refusal_used',
  wrong: 'refusal_wrong',
  no_photos: 'refusal_no_photos',
  no_signature: 'refusal_no_signature',
  no_name: 'refusal_no_name',
  needs_photo: 'refusal_needs_photo',
  not_allowed: 'refusal_not_allowed',
  terminal: 'refusal_terminal',
  out_of_order: 'refusal_out_of_order',
  revoked: 'refusal_revoked',
  // `expired` is taken by the sign-in code above, and a share link that ran
  // out is a different sentence from a code that did. The share routes send
  // `link_expired` for that reason.
  link_expired: 'refusal_link_expired',
  unknown_link: 'refusal_unknown_link',
};

/** What to show when the server says no. */
export function refusalWords(
  code: string | null,
  serverSentence: string,
  t: Words,
): string {
  const phrase = code === null ? undefined : REFUSAL_WORDS[code];
  return phrase === undefined ? serverSentence : t(phrase);
}
