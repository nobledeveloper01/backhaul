/**
 * What the three parties say to each other about a trip.
 *
 * Today this happens on WhatsApp, and that is the third of the four failures:
 * *"The conversation lives somewhere the trip does not."* When a delivery is
 * argued about, the argument is reconstructed from a phone that has since been
 * sold, in a group with forty other messages in it.
 *
 * A thread is attached to a trip, **append-only for the same reason the trip
 * history is**, and it is part of the dispute pack.
 */

export type Party = 'shipper' | 'carrier' | 'driver';

export interface Message {
  readonly id: string;
  readonly tripId: string;
  readonly from: Party;
  readonly body: string;
  readonly at: Date;
  /**
   * When the server took it, which is not when it was written.
   *
   * A driver types in a dead zone and the message leaves an hour later. Both
   * times are kept: `at` is what the driver believes and `receivedAt` is what
   * can be proved, and a dispute needs to be able to tell them apart.
   */
  readonly receivedAt: Date | null;
  /** The other parties who have seen it. */
  readonly readBy: readonly Party[];
}

/**
 * The longest a message may be.
 *
 * Not a technical limit. A thread attached to a trip is for "at the weighbridge,
 * two hours" — anything longer is a phone call, and pretending otherwise
 * produces a wall of text nobody reads on a 5-inch screen in a moving cab.
 */
export const MAX_MESSAGE_CHARS = 500;

export type SendRefusal = 'empty' | 'too_long' | 'not_a_party' | 'trip_finished';

export type SendResult =
  | { readonly ok: true; readonly message: Message }
  | { readonly ok: false; readonly reason: SendRefusal; readonly detail: string };

export function compose(options: {
  readonly id: string;
  readonly tripId: string;
  readonly from: Party;
  readonly body: string;
  readonly at: Date;
  readonly parties: readonly Party[];
  readonly tripFinished: boolean;
}): SendResult {
  const body = options.body.trim();

  if (body.length === 0) {
    return { ok: false, reason: 'empty', detail: 'Write something first.' };
  }

  if (body.length > MAX_MESSAGE_CHARS) {
    return {
      ok: false,
      reason: 'too_long',
      detail: `That is ${body.length} characters. Keep it under ${MAX_MESSAGE_CHARS} — for anything longer, call.`,
    };
  }

  if (!options.parties.includes(options.from)) {
    return {
      ok: false,
      reason: 'not_a_party',
      detail: 'Only the people on this trip can write on it.',
    };
  }

  // A finished trip's thread is evidence. Appending to it after delivery would
  // let either side add a line that was never said at the time, and the whole
  // value of the thread is that it was written while it was happening.
  if (options.tripFinished) {
    return {
      ok: false,
      reason: 'trip_finished',
      detail: 'This trip is closed. Its messages are kept as they were.',
    };
  }

  return {
    ok: true,
    message: {
      id: options.id,
      tripId: options.tripId,
      from: options.from,
      body,
      at: options.at,
      receivedAt: null,
      readBy: [options.from],
    },
  };
}

/**
 * The thread in the order it happened.
 *
 * Ordered by `at` — what was written — and ties broken by `receivedAt`, so two
 * messages sent from a dead zone in the same minute still land in the order the
 * server saw them rather than an arbitrary one.
 */
export function thread(messages: readonly Message[]): readonly Message[] {
  return [...messages].sort((a, b) => {
    const written = a.at.getTime() - b.at.getTime();
    if (written !== 0) return written;
    return (a.receivedAt?.getTime() ?? 0) - (b.receivedAt?.getTime() ?? 0);
  });
}

/** Messages this party has not seen. */
export function unread(messages: readonly Message[], reader: Party): readonly Message[] {
  return messages.filter((message) => !message.readBy.includes(reader));
}

/**
 * Messages written but not yet acknowledged by the server.
 *
 * Shown as pending rather than sent. A driver who believes a message went out
 * and finds out days later that it did not has been misled by the screen, not
 * by the network.
 */
export function pending(messages: readonly Message[]): readonly Message[] {
  return messages.filter((message) => message.receivedAt === null);
}

/**
 * How long a message sat before the server took it.
 *
 * Rendered when it is more than a few minutes, so a shipper reading "at the
 * weighbridge" timestamped two hours ago knows it was written two hours ago
 * and arrived just now — not that nobody told them for two hours.
 */
export const DELAY_WORTH_SHOWING_MS = 10 * 60_000;

export function delayed(message: Message): number | null {
  if (message.receivedAt === null) return null;
  const delay = message.receivedAt.getTime() - message.at.getTime();
  return delay >= DELAY_WORTH_SHOWING_MS ? delay : null;
}
