import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { INTERVAL, type Phrase } from '@backhaul/domain';

import { Tracker, type TrackerReport } from '../native/tracker';
import {
  canTrack,
  explain,
  request,
  type TrackingPermissions,
} from '../native/permissions';
import type { BackhaulApi } from '../api/client';

/**
 * What the driver's screen knows about the loop that is the product.
 *
 * `report` is null until the loop has turned once. `blocker` is the phrase to
 * show when it cannot turn at all — a permission the driver has to give, or a
 * handset that cannot do this.
 */
export interface Tracking {
  readonly report: TrackerReport | null;
  readonly blocker: Phrase | null;
  /** True when the OS is throttling the service. See ADR-0002. */
  readonly restricted: boolean;
  /** Ask again, after the driver has been to Settings. */
  readonly recheck: () => void;
}

const IDLE: Tracking = {
  report: null,
  blocker: null,
  restricted: false,
  recheck: () => {},
};

/**
 * Runs the capture loop for the trip in front of the driver.
 *
 * **This is the wedge, and it was not connected.** `Tracker` was written and
 * tested, `permissions.ts` was written and tested, the Android service and the
 * iOS location manager were both built — and nothing in the app ever called
 * `start()`. The driver's screen said "we are recording your trip" over a loop
 * that had never been asked to begin, and the queue depth under it was the
 * literal `18`.
 *
 * Three decisions are worth naming.
 *
 * **It starts from the trip machine, not from a button.** `shouldTrack(state)`
 * already decides when a trip is being recorded, on both sides of the wire and
 * under the parity fixtures. A second answer to that question on this screen
 * is a second thing to get wrong.
 *
 * **Permission is asked once, and its absence is a sentence rather than a
 * silence.** A driver whose location is switched off must be told that their
 * trip is not being recorded — the failure mode this loop exists to prevent is
 * a stretch of road nobody can account for, and the worst version of it is the
 * one nobody knew was happening.
 *
 * **The interval comes back from the loop.** `tick` returns the cadence the
 * policy chose from speed, battery and queue depth, and the next turn is
 * scheduled on it. A fixed timer here would be a second, slower policy
 * quietly overruling `tracking.ts`.
 */
export function useTracking(
  api: BackhaulApi,
  tripId: string | null,
  tracking: boolean,
  online: boolean,
): Tracking {
  const [report, setReport] = useState<TrackerReport | null>(null);
  const [permissions, setPermissions] = useState<TrackingPermissions | null>(null);
  const [asks, setAsks] = useState(0);

  // One tracker for the life of the screen. A new one per render would hand
  // the native module a different `newId` mid-batch.
  const tracker = useRef<Tracker | null>(null);
  tracker.current ??= new Tracker(api);

  const lastUpload = useRef<Date | undefined>(undefined);

  const wanted = tripId !== null && tracking;

  // Ask once, and again only when the driver says they have fixed it.
  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    void request().then((got) => {
      if (!cancelled) setPermissions(got);
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, asks]);

  const allowed = permissions !== null && canTrack(permissions);

  useEffect(() => {
    const loop = tracker.current;
    if (loop === null || tripId === null || !wanted || !allowed) return undefined;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const turn = async () => {
      if (stopped) return;
      // `tick` promises not to throw — a turn that fails is a normal condition
      // on a northern corridor. Caught anyway: an unhandled rejection here
      // would end the loop that is the product, and a promise is not a
      // contract.
      let next: number = INTERVAL.moving;
      try {
        const said = await loop.tick(tripId, online, new Date(), lastUpload.current);
        if (stopped) return;
        setReport(said);
        next = said.sampleIn;
        if (said.queued === 0) lastUpload.current = new Date();
      } catch {
        // Keep turning. The queue is on the phone and nothing has been lost.
      }
      if (!stopped) timer = setTimeout(() => void turn(), next * 1_000);
    };

    void loop.start(tripId, INTERVAL.moving).then(() => void turn());

    /*
      A turn as soon as the app comes back to the front.

      The native side keeps capturing in the background; this loop is the thing
      that *uploads*, and a driver who has just unlocked their phone at a
      roadside stop is the best chance of a signal that trip will get for the
      next hour.
    */
    const woke = AppState.addEventListener('change', (state) => {
      if (state === 'active') void turn();
    });

    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
      woke.remove();
      void loop.stop();
    };
  }, [tripId, wanted, allowed, online]);

  if (!wanted) return IDLE;

  const loop = tracker.current;

  return {
    report,
    blocker:
      loop !== null && !loop.available
        ? 'tracking_not_available'
        : permissions === null
          ? null
          : explain(permissions),
    restricted: report?.restrictedByOs ?? false,
    recheck: () => setAsks((was) => was + 1),
  };
}
