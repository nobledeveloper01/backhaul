import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * The phone woken to send what it holds.
 *
 * A **codegen spec**, like `NativeTracking.ts`, and a deliberately smaller
 * one. ADR-0018 put the sealed delivery on the phone and swept it when the
 * app was in front; a driver who sealed at the gate and pocketed the phone
 * held a delivery the server never saw. This is the seam that fixes it, and
 * it fixes it without the native side learning anything it should not know.
 *
 * **The native side's whole knowledge is a boolean and a network.** It is
 * told "there is something to send" (`schedule`) and "there is not"
 * (`cancel`); the OS decides when the network is there; and what runs when
 * the phone is woken is the same JavaScript sweep the foreground runs — the
 * same drafts, the same client, the same token store. Nothing native reads a
 * draft or holds a token. See ADR-0023.
 *
 * On Android the wake is a `WorkManager` periodic job starting a headless
 * JavaScript task. On iOS it is a `BGAppRefreshTask` that posts the
 * `outboxRefresh` event; the JavaScript side runs the sweep and calls
 * `finished` so the task can end inside its window.
 */
export interface Spec extends TurboModule {
  /** Something is waiting. Wake the JavaScript side when the network allows. */
  schedule(): Promise<void>;

  /** Nothing is waiting. Stop waking the phone; a phone with no deliveries costs nothing. */
  cancel(): Promise<void>;

  /** iOS: the sweep the refresh task woke has finished. Android: a no-op. */
  finished(): Promise<void>;

  addListener(eventName: string): void;

  removeListeners(count: number): void;
}

/** `get`, not `getEnforcing`, for the reason `NativeTracking.ts` gives. */
export default TurboModuleRegistry.get<Spec>('NativeOutbox');
