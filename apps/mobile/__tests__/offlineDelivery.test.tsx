import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { document, documentText, type Delivery } from '@backhaul/domain';
import { useDelivery } from '../src/state/delivery';
import { BackhaulApi } from '../src/api/client';

/**
 * Phase 4's exit gate: **a complete proof-of-delivery document generated on a
 * device that has been offline for the entire trip.**
 *
 * The API here points at a port nothing is listening on, so every request
 * fails the way it fails on a corridor: not a refusal, not a 500 — no answer
 * at all. Nothing in this file mocks the network into working, because the
 * thing being proved is what happens when it does not. The timeout is 50 ms
 * rather than the client's 8 s only so the suite finishes: a real driver waits
 * the eight seconds and the outcome is the same one.
 *
 * See ADR-0018: the device seals, and the server countersigns later.
 */
const offline = new BackhaulApi('http://127.0.0.1:1', null, 50);

const settle = () => Promise.resolve();

const AT = new Date('2026-03-04T16:20:00Z');

const empty = (tripId: string): Delivery => ({
  tripId,
  at: AT,
  photoIds: [],
  signature: null,
  capturedAt: { lat: 12.0022, lon: 8.5919, accuracy: 14, at: AT },
  note: '',
  exception: null,
});

let seen: {
  delivery: Delivery;
  sealedAt: Date | null;
  acknowledgedAt: Date | null;
  ready: boolean;
} | null = null;
let act_: { save: (next: Delivery) => void; close: () => void } | null = null;

function Probe({ tripId }: { tripId: string }) {
  const capture = useDelivery(offline, tripId, true, empty(tripId));
  seen = capture.held;
  act_ = capture;
  return <Text>{`${capture.held.delivery.photoIds.length}`}</Text>;
}

describe('a delivery captured with no network at all', () => {
  beforeEach(async () => {
    seen = null;
    act_ = null;
    await AsyncStorage.clear();
  });

  test('captures, seals and survives the app being killed', async () => {
    const tripId = 'offline-trip-1';
    let tree = create(<Probe tripId={tripId} />);
    await act(settle);

    // Two photographs, a signature and a name — everything `seal()` asks for,
    // and every one of them written with nothing on the other end.
    await act(async () => {
      act_!.save({ ...seen!.delivery, photoIds: ['p1', 'p2'] });
      await settle();
    });
    await act(async () => {
      act_!.save({
        ...seen!.delivery,
        signature: { name: 'Ibrahim Sani', role: 'storekeeper', imageId: 's1' },
      });
      await settle();
    });

    expect(seen!.delivery.photoIds).toEqual(['p1', 'p2']);
    expect(seen!.sealedAt).toBeNull();

    await act(async () => {
      act_!.close();
      await settle();
    });

    // Sealed. By this phone, on this phone, with no server involved.
    expect(seen!.sealedAt).not.toBeNull();
    // And not countersigned, which is a different fact and must stay one.
    expect(seen!.acknowledgedAt).toBeNull();

    // The app dies at the gate — OEM, battery, anything. This is the failure
    // the original server-first draft was written to prevent and the one it
    // caused instead.
    const sealedAt = seen!.sealedAt;
    tree.unmount();
    seen = null;

    tree = create(<Probe tripId={tripId} />);
    await act(settle);

    expect(seen!.delivery.photoIds).toEqual(['p1', 'p2']);
    expect(seen!.delivery.signature?.name).toBe('Ibrahim Sani');
    expect(seen!.sealedAt?.toISOString()).toBe(sealedAt?.toISOString());
    tree.unmount();
  });

  test('and the document composes from it, which is the gate', async () => {
    const tripId = 'offline-trip-2';
    let tree = create(<Probe tripId={tripId} />);
    await act(settle);

    await act(async () => {
      act_!.save({
        ...seen!.delivery,
        photoIds: ['p1', 'p2'],
        signature: { name: 'Ibrahim Sani', role: 'storekeeper', imageId: 's1' },
      });
      await settle();
    });
    await act(async () => {
      act_!.close();
      await settle();
    });

    /*
      Composed after a remount, not before one.

      The first cut of this test built the note from the same mount that
      captured it, and it went on passing with the local write disabled — it
      was reading React state, which proves nothing about a phone that has been
      offline for a whole trip and closed twice on the way. The gate is that
      the note survives the app dying, so the note is built from what came back
      off the disk.
    */
    tree.unmount();
    seen = null;
    tree = create(<Probe tripId={tripId} />);
    await act(settle);

    expect(seen!.sealedAt).not.toBeNull();

    const lines = document({
      delivery: seen!.delivery,
      destination: null,
      cargo: '28 t cement',
      reference: 'BH-0002',
      sealedAt: seen!.sealedAt,
      formatDate: (at: Date) => at.toISOString(),
    });

    const text = documentText({ title: 'Delivery note', lines });

    // A complete note: the reference, what was carried, who signed, and the
    // seal. Nothing here asked a server anything.
    expect(text).toContain('BH-0002');
    expect(text).toContain('28 t cement');
    expect(text).toContain('Ibrahim Sani');
    expect(text).toContain('Sealed');
    tree.unmount();
  });

  test('an unsealed delivery is not one, however much was captured', async () => {
    // The rule is the rule offline too. A photograph short is a delivery that
    // does not close, and the driver is told which.
    const tripId = 'offline-trip-3';
    const tree = create(<Probe tripId={tripId} />);
    await act(settle);

    await act(async () => {
      act_!.save({ ...seen!.delivery, photoIds: ['p1'] });
      await settle();
    });
    await act(async () => {
      act_!.close();
      await settle();
    });

    expect(seen!.sealedAt).toBeNull();
    tree.unmount();
  });
});
