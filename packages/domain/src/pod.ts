/**
 * Proof of delivery.
 *
 * The fourth failure: *"There is no proof of anything."* A delivery today is
 * a signature on a waybill that stays in the cab until somebody remembers to
 * bring it back, and a shortage discovered a week later is unarguable in both
 * directions.
 *
 * Proof here is four things captured at the destination, at the moment of
 * handover: photographs, a name, a signature, and where the phone was when it
 * happened. The last of those is the one that cannot be faked afterwards, and
 * it is why this belongs to the tracking product rather than to a paperwork one.
 */

import { distance, type Position } from './geo.ts';
import type { Waypoint } from './waypoints.ts';

export interface Signature {
  /** Who signed, as they wrote it. */
  readonly name: string;
  /** Their role at the receiving end: "storekeeper", "owner". */
  readonly role: string;
  /** The strokes, as an opaque blob id. The domain never looks inside. */
  readonly imageId: string;
}

export interface Delivery {
  readonly tripId: string;
  readonly at: Date;
  readonly photoIds: readonly string[];
  readonly signature: Signature | null;
  /** Where the phone was. Null when no fix was available. */
  readonly capturedAt: Position | null;
  readonly note: string;
  /** Goods signed for short or damaged. */
  readonly exception: DeliveryException | null;
}

export type ExceptionKind = 'short' | 'damaged' | 'refused';

export interface DeliveryException {
  readonly kind: ExceptionKind;
  /** How many units, where the load was counted in units. */
  readonly quantity: number | null;
  readonly note: string;
  readonly photoIds: readonly string[];
}

/**
 * The fewest photographs that make a delivery arguable.
 *
 * Two: the goods, and the place. One photograph of a pallet could have been
 * taken anywhere; a second showing the gate makes the pair hard to assemble
 * after the fact.
 */
export const MINIMUM_PHOTOS = 2;

/**
 * How far from the destination a capture may be and still be believed.
 *
 * Generous — a kilometre — because a market address in Kano is a district, not
 * a gate, and the alternative is a driver who cannot close a delivery they have
 * actually made. It is a **flag, not a refusal**: the delivery still records,
 * and the distance is shown to whoever reads it.
 */
export const CAPTURE_RADIUS_M = 1_000;

export type PodRefusal = 'no_photos' | 'no_signature' | 'no_name';

export type PodResult =
  | { readonly ok: true; readonly delivery: Delivery }
  | { readonly ok: false; readonly reason: PodRefusal; readonly detail: string };

/**
 * Whether this is enough to call a delivery proved.
 *
 * Deliberately short. Every extra requirement is another thing a driver has to
 * do standing in a market with a queue behind them, and a proof requirement
 * that does not get met produces no proof at all.
 */
export function seal(delivery: Delivery): PodResult {
  if (delivery.photoIds.length < MINIMUM_PHOTOS) {
    const short = MINIMUM_PHOTOS - delivery.photoIds.length;
    return {
      ok: false,
      reason: 'no_photos',
      detail: `Take ${short} more photo${short === 1 ? '' : 's'} — the goods, and where you are.`,
    };
  }

  if (delivery.signature === null) {
    return {
      ok: false,
      reason: 'no_signature',
      detail: 'Ask whoever is receiving to sign.',
    };
  }

  if (delivery.signature.name.trim().length === 0) {
    return {
      ok: false,
      reason: 'no_name',
      detail: 'Write the name of the person signing.',
    };
  }

  return { ok: true, delivery };
}

/**
 * How far the capture was from where it should have been, or null.
 *
 * Null covers both "no fix" and "no destination on file", and the two read the
 * same on screen: nothing is claimed either way. Claiming a delivery was made
 * at the right place on the strength of no evidence is worse than claiming
 * nothing.
 */
export function capturedNear(
  delivery: Delivery,
  destination: Waypoint | null,
): number | null {
  if (delivery.capturedAt === null || destination === null) return null;
  return distance(delivery.capturedAt, destination.at);
}

/** Whether the capture happened somewhere worth mentioning. */
export function capturedAwayFromDestination(
  delivery: Delivery,
  destination: Waypoint | null,
): boolean {
  const away = capturedNear(delivery, destination);
  return away !== null && away > CAPTURE_RADIUS_M;
}

/**
 * The lines of the delivery note, in the order a reader needs them.
 *
 * Built here rather than in a screen because the same lines go into the PDF,
 * the dispute pack and the trip detail, and three renderings of the same
 * document that disagree is precisely the situation a proof is supposed to end.
 */
export interface PodLine {
  readonly label: string;
  readonly value: string;
}

export function document(options: {
  readonly delivery: Delivery;
  readonly destination: Waypoint | null;
  readonly cargo: string;
  readonly reference: string;
  /**
   * When the proof stopped being editable, or null while it still is.
   *
   * Not optional, so that a caller has to decide. A note handed to a receiver
   * with no seal on it is a draft that reads like a record, and the reader
   * cannot tell the difference from the outside.
   */
  readonly sealedAt: Date | null;
  readonly formatDate: (at: Date) => string;
}): readonly PodLine[] {
  const { delivery, destination } = options;
  const lines: PodLine[] = [
    { label: 'Reference', value: options.reference },
    { label: 'Cargo', value: options.cargo },
    { label: 'Delivered', value: options.formatDate(delivery.at) },
  ];

  if (destination !== null) lines.push({ label: 'To', value: destination.name });

  if (delivery.signature !== null) {
    lines.push({
      label: 'Received by',
      value:
        delivery.signature.role.trim().length > 0
          ? `${delivery.signature.name} (${delivery.signature.role})`
          : delivery.signature.name,
    });
  }

  lines.push({
    label: 'Photographs',
    value: `${delivery.photoIds.length}`,
  });

  const away = capturedNear(delivery, destination);
  lines.push({
    label: 'Captured',
    value:
      away === null
        ? 'No position recorded'
        : away <= CAPTURE_RADIUS_M
          ? 'At the destination'
          : `${Math.round(away / 100) / 10} km from the destination`,
  });

  if (delivery.exception !== null) {
    lines.push({ label: 'Exception', value: describeException(delivery.exception) });
  }

  /*
    Last, because it is what the lines above are worth.

    Everything before this is a draft until it is sealed, and an unsealed
    delivery is still editable — photographs can come and go, a name can be
    rewritten. The seal is the only line that says the rest stopped moving,
    which is why it sits at the foot of the note like a stamp rather than in
    the header where a reader skims past it.
  */
  if (options.sealedAt !== null) {
    lines.push({ label: 'Sealed', value: options.formatDate(options.sealedAt) });
  }

  return lines;
}

/**
 * The note as one block of text, for handing over.
 *
 * The point of a proof is that the copy in the driver's hand, the copy on the
 * shipper's screen and the copy in a dispute say the same thing, so the
 * hand-over composes the same `PodLine`s rather than reassembling the delivery
 * a second time. A screen that built its own string would be the third
 * rendering this whole module exists to prevent.
 *
 * The title is passed in because it is the one part a reader reads in their own
 * language, and the domain has no reader. Everything below it is the record.
 */
export function documentText(options: {
  readonly title: string;
  readonly lines: readonly PodLine[];
}): string {
  const body = options.lines.map((line) => `${line.label}: ${line.value}`);
  return [options.title, '', ...body].join('\n');
}

export function describeException(exception: DeliveryException): string {
  const quantity = exception.quantity === null ? '' : `${exception.quantity} `;
  switch (exception.kind) {
    case 'short':
      return `${quantity}short`.trim();
    case 'damaged':
      return `${quantity}damaged`.trim();
    case 'refused':
      return 'Refused on delivery';
  }
}

/**
 * Whether a delivery with an exception should still settle.
 *
 * It should. A short delivery is a delivery, and holding the whole payment
 * until a quantity dispute resolves punishes a carrier for a discrepancy that
 * is usually the loading end's. The exception is recorded against the trip and
 * argued separately; a refusal is the one case where nothing was handed over
 * and nothing is owed for the handover.
 */
export function settlesDespite(exception: DeliveryException | null): boolean {
  return exception === null || exception.kind !== 'refused';
}
