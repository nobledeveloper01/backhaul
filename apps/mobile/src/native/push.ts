import { NativeModules, Platform } from 'react-native';
import type { Phrase } from '@backhaul/domain';

/**
 * Where a push token comes from, and what to say when there is none.
 *
 * The same shape as `permissions.ts`, and for the same reasons: the *sequence*
 * matters, the answer is often "no" with a cause worth telling somebody, and
 * the cause is a phrase key rather than a sentence because this module knows
 * nothing about which of the four languages the phone is in.
 *
 * **It never invents a token.** A registration is a promise that a person can
 * be reached, and a `Devices` row holding a made-up string is a promise the
 * platform cannot keep — silently, and in the worst direction: the dispatcher
 * marks the alert sent, `repeatAfterMs` suppresses the retry, and the shipper
 * is never told about the stall. See ADR-0013.
 */
export type PushToken =
  | { readonly kind: 'token'; readonly value: string }
  | { readonly kind: 'unavailable'; readonly why: Phrase };

/**
 * The native side, when a provider has been linked.
 *
 * `NativeModules` rather than `TurboModuleRegistry`: this is an optional
 * integration that most builds will not have, and the registry's typed lookup
 * wants a spec that only exists once somebody has added one. Absent is the
 * normal case here, not an error.
 */
interface PushModule {
  readonly getToken: () => Promise<string | null>;
}

function linked(): PushModule | null {
  const found = (NativeModules as Record<string, unknown>)['BackhaulPush'];
  if (found === null || found === undefined) return null;
  const module = found as Partial<PushModule>;
  return typeof module.getToken === 'function' ? (module as PushModule) : null;
}

/**
 * This install's push token, or why it has none.
 *
 * The two "no" cases are different situations and get different sentences. No
 * provider linked is a build that was never given credentials — nothing the
 * person holding the phone can do, and telling them to check their settings
 * would be a dead end. A provider that refuses is usually the person having
 * said no to notifications, or a handset without Play Services, and that one
 * they can act on.
 */
export async function pushToken(): Promise<PushToken> {
  const module = linked();
  if (module === null) return { kind: 'unavailable', why: 'push_not_configured' };

  try {
    const value = await module.getToken();
    if (value === null || value.trim().length === 0) {
      return { kind: 'unavailable', why: 'push_refused' };
    }
    return { kind: 'token', value };
  } catch {
    // A provider that throws is a provider that cannot deliver, which is the
    // same fact to the reader as one that returned nothing.
    return { kind: 'unavailable', why: 'push_refused' };
  }
}

/** Which store the token belongs to, for the server's send path. */
export function pushPlatform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/**
 * How far this phone's clock is from UTC, in minutes.
 *
 * Sent with the registration because quiet hours are the reader's, not the
 * server's. The alerts *screen* can be asked what hour it is; the dispatcher
 * runs at three in the morning with nobody to ask, and assuming West Africa
 * Time inside the server is how this breaks the first time somebody ships from
 * Accra.
 *
 * `getTimezoneOffset` is minutes *behind* UTC and the server wants minutes
 * ahead, which is why this is negated. Getting that backwards puts a Lagos
 * shipper's quiet hours in the middle of their afternoon.
 */
export function utcOffsetMinutes(now: Date = new Date()): number {
  return -now.getTimezoneOffset();
}
