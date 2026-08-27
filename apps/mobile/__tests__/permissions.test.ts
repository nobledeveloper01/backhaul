import { PermissionsAndroid, Platform } from 'react-native';

import { say, type Phrase } from '@backhaul/domain';

import { canTrack, explain, request } from '../src/native/permissions';

/**
 * The prompts are the only thing standing between a driver and a recorded
 * trip, and the sequence is easy to get subtly wrong.
 */

const ORIGINAL_OS = Platform.OS;
const ORIGINAL_VERSION = Platform.Version;

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { value: ORIGINAL_OS, configurable: true });
  Object.defineProperty(Platform, 'Version', { value: ORIGINAL_VERSION, configurable: true });
  jest.restoreAllMocks();
});

function android(version: number): void {
  Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
  Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
}

function answers(results: string[]): jest.SpyInstance {
  const request_ = jest.spyOn(PermissionsAndroid, 'request');
  results.forEach((result) => request_.mockResolvedValueOnce(result as never));
  return request_;
}

describe('on Android', () => {
  test('asks for the notification first, then location', async () => {
    // On 13+ the notification permission has to be granted before the
    // foreground service starts, or its notification is silently dropped —
    // and on several OEM builds a service with no visible notification is
    // grounds for killing it.
    android(34);
    const request_ = answers(['granted', 'granted']);

    await request();

    expect(request_).toHaveBeenNthCalledWith(1, PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    expect(request_).toHaveBeenNthCalledWith(2, PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  });

  test('does not ask for a notification permission that does not exist yet', async () => {
    android(31);
    const request_ = answers(['granted']);

    const outcome = await request();

    expect(request_).toHaveBeenCalledTimes(1);
    expect(outcome.notifications).toBe('granted');
  });

  test('tells "never ask again" apart from "no"', async () => {
    // A screen that treats them the same shows a button that does nothing,
    // twice. Only one of them has a forward path, and it leaves the app.
    android(34);
    answers(['granted', 'never_ask_again']);

    const outcome = await request();

    expect(outcome.location).toBe('blocked');
  });
});

describe('on iOS', () => {
  test('claims nothing, because CoreLocation raises its own prompt', async () => {
    // The iOS prompt belongs to the location manager and is raised by the
    // native module when it starts. Claiming to have asked here would be a lie
    // the driver's screen would then render.
    Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
    const request_ = jest.spyOn(PermissionsAndroid, 'request');

    const outcome = await request();

    expect(request_).not.toHaveBeenCalled();
    expect(canTrack(outcome)).toBe(true);
  });
});

describe('canTrack', () => {
  test('needs location and nothing else', () => {
    // Refusing a notification should not stop a trip being recorded. It makes
    // Android treat the service more harshly, which `restrictedByOs` reports.
    expect(canTrack({ location: 'granted', notifications: 'denied' })).toBe(true);
    expect(canTrack({ location: 'denied', notifications: 'granted' })).toBe(false);
  });
});

describe('explain', () => {
  test('tells blocked apart from denied, because the forward paths differ', () => {
    // `blocked` means nothing this app does will raise another prompt and the
    // only way on is Settings. A screen that treats it as `denied` shows a
    // button that does nothing, twice.
    expect(explain({ location: 'blocked', notifications: 'granted' })).toBe('location_blocked');
    expect(explain({ location: 'denied', notifications: 'granted' })).toBe('location_denied');
  });

  test('warns about the notification without stopping the trip', () => {
    // Notifications are not required — `canTrack` says so — so the warning is
    // about gaps rather than about nothing being recorded.
    expect(explain({ location: 'granted', notifications: 'denied' })).toBe(
      'notifications_missing',
    );
  });

  test('says what it means for the driver, in their own language', () => {
    // A key, not a sentence. This module knows nothing about which of the four
    // languages the phone is in, and the one message a driver most needs to
    // act on is the last one that should arrive in English.
    for (const language of ['ha', 'yo', 'ig'] as const) {
      const key = explain({ location: 'blocked', notifications: 'granted' });
      expect(key).not.toBeNull();
      expect(say(language, key as Phrase)).not.toBe(say('en', key as Phrase));
    }
  });

  test('says nothing when there is nothing to say', () => {
    expect(explain({ location: 'granted', notifications: 'granted' })).toBeNull();
  });
});
