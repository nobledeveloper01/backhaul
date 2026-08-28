import {
  acknowledge,
  decide,
  failed,
  health,
  nextBatch,
  oldestWaiting,
  type Conditions,
  type Position,
  type QueuedSample,
  type QueueHealth,
} from '@backhaul/domain';

import type { BackhaulApi } from '@backhaul/api';
import { NativeTracking, type NativeFix, type Spec } from '@backhaul/tracking-native';
import { newId as newId_ } from '../state/ids';

/**
 * The upload loop.
 *
 * The *capture* loop is native and runs whether this code is alive or not
 * (ADR-0002). This is the other half: it reads what the native queue has,
 * decides — via `@backhaul/domain` — whether to send, sends it, and deletes
 * **only what the server acknowledged**.
 *
 * The one rule everything here is arranged around:
 *
 * > A fix is deleted from the phone when, and only when, the server has
 * > acknowledged that exact fix by id.
 *
 * Not when a batch was sent. Not when a response arrived. Not when a batch
 * containing it was acknowledged in part.
 */

export interface TrackerReport {
  readonly queued: number;
  readonly health: QueueHealth;
  readonly oldestWaiting: Date | null;
  /** Seconds until the native side should take the next fix. */
  readonly sampleIn: number;
  /** One phrase, for the driver's screen. */
  readonly because: string;
  /**
   * True when the OS has restricted the app in the background.
   *
   * Surfaced rather than logged. On a Transsion handset this is the difference
   * between a trip that records and one that quietly does not, and the app's
   * own log is the last place anybody looks.
   */
  readonly restrictedByOs: boolean;
}

/** The native module, or nothing — Jest, the web console, an unlinked build. */
export type TrackingModule = Spec | null;

export class Tracker {
  private readonly api: BackhaulApi;
  private readonly native: TrackingModule;
  private readonly newId: () => string;

  constructor(
    api: BackhaulApi,
    // `TurboModuleRegistry.get` returns `Spec | null` at runtime and
    // `Spec | null | undefined` to the type system. Normalised here so every
    // caller sees one shape.
    native: TrackingModule = NativeTracking ?? null,
    newId: () => string = newId_,
  ) {
    this.api = api;
    this.native = native;
    this.newId = newId;
  }

  get available(): boolean {
    return this.native !== null;
  }

  async start(tripId: string, sampleIntervalSeconds: number): Promise<void> {
    await this.native?.start(tripId, sampleIntervalSeconds);
  }

  async stop(): Promise<void> {
    await this.native?.stop();
  }

  /**
   * One turn of the loop: look, decide, maybe send, delete what stuck.
   *
   * Returns what the driver's screen should say. Never throws — a turn that
   * fails is a normal condition on a northern corridor, and an exception here
   * would take down the loop that is the product.
   */
  async tick(
    tripId: string,
    online: boolean,
    now: Date,
    lastUpload?: Date,
  ): Promise<TrackerReport> {
    const native = this.native;
    if (native === null) {
      return {
        queued: 0,
        health: 'fine',
        oldestWaiting: null,
        sampleIn: 60,
        because: 'tracking is not available on this device',
        restrictedByOs: false,
      };
    }

    const status = await native.status();
    // Read without removing. A single call that took as it read would lose the
    // batch when the upload failed.
    const peeked = await native.peek(200);
    const queue = peeked.map(toQueued);

    const conditions: Conditions = {
      speed: speedOf(queue),
      online,
      queued: queue.length,
      ...(batteryOf(queue) === null ? {} : { battery: batteryOf(queue) as number }),
      ...(lastUpload === undefined ? {} : { lastUpload }),
    };

    const plan = decide(conditions, now);

    // Cadence first, and unconditionally: a battery that has just dropped below
    // the threshold should slow sampling even on a turn where nothing uploads.
    await native.setSampleInterval(plan.sampleIn);

    let remaining = queue;

    if (plan.upload) {
      const batch = nextBatch(queue, this.newId());
      if (batch !== null) {
        const result = await this.api.uploadBatch(batch.batchId, tripId, batch.samples);

        if (result.ok) {
          // The ids we sent, because the server acknowledged the batch. A
          // server that ever acknowledges a subset must return the subset, and
          // this is the line that would change.
          const acknowledged = batch.samples.map((sample) => sample.id);
          await native.acknowledge(acknowledged);
          remaining = acknowledge(queue, acknowledged) as QueuedSample[];
        } else {
          // Nothing is deleted. Not on a refusal either: a 401 means get a
          // token, not throw away the evidence.
          remaining = failed(queue, batch) as QueuedSample[];
        }
      }
    }

    return {
      queued: remaining.length,
      health: health(remaining),
      oldestWaiting: oldestWaiting(remaining),
      sampleIn: plan.sampleIn,
      because: plan.because,
      restrictedByOs: status.restrictedByOs,
    };
  }
}

function toQueued(fix: NativeFix): QueuedSample {
  return {
    id: fix.id,
    lat: fix.lat,
    lon: fix.lon,
    accuracy: fix.accuracy,
    at: new Date(fix.at),
    attempts: 0,
    // -1 is the codegen's way of saying "the OS did not tell us". Carrying it
    // through as a number would make a phone at -100% battery.
    ...(fix.speed < 0 ? {} : { speed: fix.speed }),
    ...(fix.battery < 0 ? {} : { battery: fix.battery }),
  };
}

/** Speed from the newest fix that reported one, or zero. */
function speedOf(queue: readonly QueuedSample[]): number {
  for (let i = queue.length - 1; i >= 0; i--) {
    const speed = queue[i]?.speed;
    if (speed !== undefined) return speed;
  }
  return 0;
}

/** Battery from the newest fix that reported it, or null. */
function batteryOf(queue: readonly QueuedSample[]): number | null {
  for (let i = queue.length - 1; i >= 0; i--) {
    const battery = queue[i]?.battery;
    if (battery !== undefined) return battery;
  }
  return null;
}

/**
 * A batch id.
 *
 * `crypto.randomUUID` where it exists; otherwise time plus randomness, which is
 * weaker than it looks and is fine here — a batch id is an idempotency key, not
 * a secret, and a collision costs one replayed batch.
 */
export type { Position };
