import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Delivery, ExceptionKind } from '@backhaul/domain';
import type { BackhaulApi, DeliveryDraft } from '@backhaul/api';

/**
 * The delivery a driver captured, held on the phone until the server has it.
 *
 * `ProofScreen` used to read and write the draft straight through the API, and
 * the comment explaining why was right about durability and wrong about where:
 * a delivery is captured at a market gate on a phone that may be closed, killed
 * by the OEM, or flat before the driver reaches the office — and on a corridor
 * where there is no signal for two hours either way. Writing it to the server
 * first means a driver who photographed the goods, took a signature, and has
 * nothing.
 *
 * It is not a lost form. `earnings.ts` skips a delivered trip with no sealed
 * proof and the escrow milestone never releases, so a delivery captured and
 * lost is a driver who finished the run and is not paid.
 *
 * See ADR-0018: the device seals and the server countersigns.
 */

const KEY = (tripId: string) => `backhaul.delivery.v1.${tripId}`;

/** The trip ids with a draft on this phone, so the outbox knows what to send. */
const INDEX = 'backhaul.delivery.index.v1';

export interface Draft {
  readonly delivery: Delivery;
  /**
   * When the driver sealed it, by this phone's clock, or null if they have not.
   *
   * A claim about when the delivery happened. The server's `sealedAt` is a
   * different fact — when this platform first saw the evidence — and both are
   * kept because a dispute wants the gap between them, which a coverage hole
   * explains and a merge would erase.
   */
  readonly sealedAt: Date | null;
  /** Null until the server has acknowledged it. Not "sent": acknowledged. */
  readonly acknowledgedAt: Date | null;
}

/*
  Dates do not survive JSON, and a delivery whose `at` came back as a string
  renders "Invalid Date" on the one document a dispute reads. Every crossing is
  explicit for that reason rather than relying on a reviver.
*/
interface Stored {
  readonly tripId: string;
  readonly at: string;
  readonly photoIds: readonly string[];
  readonly signature: { name: string; role: string; imageId: string } | null;
  readonly capturedAt: { lat: number; lon: number; accuracy: number; at: string } | null;
  readonly note: string;
  readonly exception: {
    kind: ExceptionKind;
    quantity: number | null;
    note: string;
    photoIds: readonly string[];
  } | null;
  readonly sealedAt: string | null;
  readonly acknowledgedAt: string | null;
}

function encode(draft: Draft): Stored {
  const { delivery } = draft;
  return {
    tripId: delivery.tripId,
    at: delivery.at.toISOString(),
    photoIds: delivery.photoIds,
    signature:
      delivery.signature === null
        ? null
        : {
            name: delivery.signature.name,
            role: delivery.signature.role,
            imageId: delivery.signature.imageId,
          },
    capturedAt:
      delivery.capturedAt === null
        ? null
        : {
            lat: delivery.capturedAt.lat,
            lon: delivery.capturedAt.lon,
            accuracy: delivery.capturedAt.accuracy,
            at: delivery.capturedAt.at.toISOString(),
          },
    note: delivery.note,
    exception:
      delivery.exception === null
        ? null
        : {
            kind: delivery.exception.kind,
            quantity: delivery.exception.quantity,
            note: delivery.exception.note,
            photoIds: delivery.exception.photoIds,
          },
    sealedAt: draft.sealedAt?.toISOString() ?? null,
    acknowledgedAt: draft.acknowledgedAt?.toISOString() ?? null,
  };
}

function decode(stored: Stored): Draft {
  return {
    delivery: {
      tripId: stored.tripId,
      at: new Date(stored.at),
      photoIds: stored.photoIds,
      signature: stored.signature,
      capturedAt:
        stored.capturedAt === null
          ? null
          : { ...stored.capturedAt, at: new Date(stored.capturedAt.at) },
      note: stored.note,
      exception: stored.exception,
    },
    sealedAt: stored.sealedAt === null ? null : new Date(stored.sealedAt),
    acknowledgedAt:
      stored.acknowledgedAt === null ? null : new Date(stored.acknowledgedAt),
  };
}

/**
 * Reads a draft, or null.
 *
 * Unreadable storage answers null rather than throwing. A driver at a gate
 * cannot do anything about corrupt JSON, and a screen that refuses to render
 * because of it is worse than one that starts a fresh capture.
 */
export async function readDraft(tripId: string): Promise<Draft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY(tripId));
    return raw === null ? null : decode(JSON.parse(raw) as Stored);
  } catch {
    return null;
  }
}

/** Writes a draft. Errors are swallowed: see `readDraft`. */
export async function writeDraft(draft: Draft): Promise<void> {
  const { tripId } = draft.delivery;
  try {
    await AsyncStorage.setItem(KEY(tripId), JSON.stringify(encode(draft)));

    const listed = await ids();
    if (!listed.includes(tripId)) {
      await AsyncStorage.setItem(INDEX, JSON.stringify([...listed, tripId]));
    }
  } catch {
    // Nothing to do about it here, and throwing loses the capture that is
    // already in front of the driver.
  }
}

/** Every trip with a draft on this phone. */
export async function ids(): Promise<readonly string[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX);
    return raw === null ? [] : (JSON.parse(raw) as string[]);
  } catch {
    return [];
  }
}

/**
 * Every draft the server has not acknowledged.
 *
 * Not "not sent" — not *acknowledged*. The same rule as ADR-0009: a request
 * that went out and was never answered is a request that may not have arrived,
 * and evidence is not deleted on a hope.
 */
export async function unsent(): Promise<readonly Draft[]> {
  const listed = await ids();
  const drafts = await Promise.all(listed.map(readDraft));
  return drafts.filter(
    (draft): draft is Draft => draft !== null && draft.acknowledgedAt === null,
  );
}

/**
 * Forgets a draft.
 *
 * Only for a delivery the server has countersigned. There is no other caller,
 * and there should not be: the local copy is the only copy until then.
 */
export async function forget(tripId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY(tripId));
    const listed = await ids();
    await AsyncStorage.setItem(
      INDEX,
      JSON.stringify(listed.filter((id) => id !== tripId)),
    );
  } catch {
    // As above.
  }
}


/**
 * The draft on the wire.
 *
 * Here rather than in the screen's hook because two callers send drafts — the
 * proof screen, while somebody is looking at it, and the outbox, which sweeps
 * every unacknowledged one whenever the app comes back. Two spellings of "what
 * a delivery looks like on the wire" is how a delivery uploaded from the
 * background loses a field the screen sends.
 */
export function toDraftBody(delivery: Delivery): DeliveryDraft {
  return {
    at: delivery.at,
    photoIds: [...delivery.photoIds],
    signatureName: delivery.signature?.name ?? null,
    signatureRole: delivery.signature?.role ?? null,
    signatureImageId: delivery.signature?.imageId ?? null,
    // Omitted rather than nulled when there was no fix. The three are optional
    // on the wire and a null latitude is not a place.
    ...(delivery.capturedAt === null
      ? {}
      : {
          capturedLat: delivery.capturedAt.lat,
          capturedLon: delivery.capturedAt.lon,
          capturedAccuracy: delivery.capturedAt.accuracy,
        }),
    note: delivery.note,
    exceptionKind: delivery.exception?.kind ?? null,
    exceptionQuantity: delivery.exception?.quantity ?? null,
    exceptionNote: delivery.exception?.note ?? null,
  };
}

/**
 * Sends one draft, and answers when the server countersigned it.
 *
 * Null means "not yet", which covers no network, a refusal and a server that
 * has not sealed it — and every one of those is a reason to keep the local
 * copy and try again later, so none of them is worth distinguishing here. The
 * evidence is not deleted on a hope: ADR-0009 for fixes, ADR-0018 for this.
 */
export async function send(api: BackhaulApi, draft: Draft): Promise<Date | null> {
  const { tripId } = draft.delivery;

  const saved = await api.saveDelivery(tripId, toDraftBody(draft.delivery));
  if (!saved.ok) return null;

  // An unsealed draft is saved and nothing more. Sealing is the driver's act
  // and the outbox must never perform it on their behalf.
  if (draft.sealedAt === null) return null;

  const sealed = await api.sealDelivery(tripId);
  if (!sealed.ok || sealed.value.sealedAt === null) return null;

  const acknowledged = sealed.value.sealedAt;
  await writeDraft({ ...draft, acknowledgedAt: acknowledged });
  return acknowledged;
}
