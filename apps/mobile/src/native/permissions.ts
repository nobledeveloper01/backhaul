import { Linking, PermissionsAndroid, Platform } from 'react-native';
import type { Phrase } from '@backhaul/domain';

/**
 * Asking for the two things the capture loop cannot work without.
 *
 * Written as its own module because the *sequence* matters and is easy to get
 * subtly wrong: on Android 13+ the notification permission has to be granted
 * before the foreground service starts, or the service's notification is
 * silently dropped — and on several OEM builds a foreground service with no
 * visible notification is grounds for killing it.
 *
 * iOS is not here at all. `CLLocationManager.requestWhenInUseAuthorization`
 * has to be called by the location manager itself, so it lives in the native
 * module, and this returns `granted` for iOS rather than pretending to have
 * asked.
 */
export type PermissionOutcome =
  | 'granted'
  /** The person said no. Askable again. */
  | 'denied'
  /**
   * The person said never.
   *
   * A different situation entirely: nothing this app does will produce another
   * prompt, and the only forward path is Settings. A screen that treats this
   * as `denied` shows a button that does nothing, twice.
   */
  | 'blocked';

export interface TrackingPermissions {
  readonly location: PermissionOutcome;
  readonly notifications: PermissionOutcome;
}

/**
 * Whether the loop can run at all.
 *
 * Notifications are **not** required. A driver who refuses them gets a service
 * that Android may treat more harshly, which `status().restrictedByOs`
 * reports — but refusing a notification should not stop a trip being recorded.
 */
export function canTrack(permissions: TrackingPermissions): boolean {
  return permissions.location === 'granted';
}

export async function request(): Promise<TrackingPermissions> {
  if (Platform.OS !== 'android') {
    // The iOS prompt belongs to CoreLocation and is raised by the native
    // module when it starts. Claiming to have asked here would be a lie the
    // driver's screen would then render.
    return { location: 'granted', notifications: 'granted' };
  }

  const notifications =
    Platform.Version >= 33
      ? toOutcome(
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          ),
        )
      : 'granted';

  const location = toOutcome(
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ),
  );

  return { location, notifications };
}

/**
 * The only forward path out of `blocked`.
 *
 * Every error state in this product has one; this is the one that leaves the
 * app to get it.
 */
export async function openSettings(): Promise<void> {
  await Linking.openSettings();
}

function toOutcome(result: string): PermissionOutcome {
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
  return 'denied';
}

/**
 * What to say, in the driver's own terms.
 *
 * Not "permission denied". A driver reading that has been told what the
 * operating system calls the problem, not what it means for them or what to do
 * about it.
 *
 * A phrase key rather than a sentence, because the driver face is read in four
 * languages and this module knows none of them. It used to return English,
 * which would have put the one message a driver most needs to act on in the
 * one language many of them do not read.
 */
export function explain(permissions: TrackingPermissions): Phrase | null {
  if (permissions.location === 'blocked') return 'location_blocked';
  if (permissions.location === 'denied') return 'location_denied';
  if (permissions.notifications !== 'granted') return 'notifications_missing';
  return null;
}
