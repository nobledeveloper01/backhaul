import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * The native tracking module's contract.
 *
 * This file is a **codegen spec**, not an implementation. React Native reads
 * it at build time and generates the C++/Java/ObjC glue, which is why it is
 * written in the restricted subset the codegen understands — no unions of
 * object types, no generics, no enums.
 *
 * The loop this describes does not live in JavaScript (ADR-0002): an Android
 * foreground service and iOS background location, writing to a native SQLite
 * queue, running when the app is backgrounded, killed or rebooted. The
 * JavaScript runtime is suspended for most of a three-day trip and is not a
 * place a capture loop can live.
 *
 * **The native side decides nothing.** It captures, it stores, it uploads what
 * it is told to upload, and it asks this side what to do next. Every judgement
 * — sampling cadence, when to upload, what counts as silence, what may be
 * deleted — is in `@backhaul/domain`, so the two platforms cannot drift into
 * disagreeing and so all of it is testable without a truck.
 */

/** A position fix, flattened: the codegen has no `Date` and no optionals-in-unions. */
export interface NativeFix {
  /** Client-generated at capture. The deduplication key, end to end. */
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly accuracy: number;
  /** Milliseconds since the epoch. */
  readonly at: number;
  /** Metres per second; -1 when the OS did not say. */
  readonly speed: number;
  /** 0–1; -1 when the OS did not say. */
  readonly battery: number;
}

export interface TrackingStatus {
  readonly running: boolean;
  readonly tripId: string;
  /** Rows waiting in the native queue. */
  readonly queued: number;
  /** Milliseconds since the epoch, or -1 if nothing has ever been captured. */
  readonly lastFixAt: number;
  /**
   * Whether the OS has restricted the app in the background.
   *
   * The single most important field here. On Transsion handsets — which
   * dominate the driver segment — aggressive battery management kills a
   * foreground service, and the app's own logs are the last place anyone
   * looks. When this is true the driver is told plainly rather than the trip
   * quietly recording nothing.
   */
  readonly restrictedByOs: boolean;
}

export interface Spec extends TurboModule {
  /**
   * Starts capturing for a trip.
   *
   * Idempotent: starting a trip that is already running is a no-op rather than
   * a second loop. A driver who taps twice must not double the battery cost.
   */
  start(tripId: string, sampleIntervalSeconds: number): Promise<void>;

  /** Stops capturing. Does not delete anything still queued. */
  stop(): Promise<void>;

  /**
   * Changes the cadence without restarting the loop.
   *
   * The policy in `@backhaul/domain` decides this from speed and battery, and
   * it changes many times a trip. Restarting the service each time would cost
   * more battery than the change saves.
   */
  setSampleInterval(seconds: number): Promise<void>;

  status(): Promise<TrackingStatus>;

  /**
   * The oldest queued fixes, up to `limit`, without removing them.
   *
   * Reading and deleting are separate calls on purpose. A single
   * `takeBatch` that removed as it read would lose the batch if the upload
   * failed — and losing evidence is the one thing this subsystem exists to
   * prevent.
   */
  peek(limit: number): Promise<NativeFix[]>;

  /**
   * Deletes exactly these ids.
   *
   * Called only with ids the server has acknowledged. Not the batch that was
   * sent; not a count.
   */
  acknowledge(ids: string[]): Promise<number>;

  /** Rows currently in the queue. */
  queueDepth(): Promise<number>;
}

/**
 * `get`, not `getEnforcing`.
 *
 * The module is absent in Jest, on the web console, and in any build where the
 * native side has not been linked. Every caller has to handle its absence
 * anyway — see `tracker.ts` — and `getEnforcing` would turn "no tracking on
 * this platform" into a crash at import time.
 */
export default TurboModuleRegistry.get<Spec>('NativeTracking');
