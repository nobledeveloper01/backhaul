import { PermissionsAndroid, Platform } from 'react-native';

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
  test('says what it means for the driver, not what the OS calls it', () => {
    const blocked = explain({ location: 'blocked', notifications: 'granted' });
    expect(blocked).toMatch(/not being recorded/);
    expect(blocked).toMatch(/Settings/);
    expect(blocked).not.toMatch(/permission/i);
  });

  test('warns about the notification without overstating it', () => {
    const said = explain({ location: 'granted', notifications: 'denied' });
    expect(said).toMatch(/may/);
  });

  test('says nothing when there is nothing to say', () => {
    expect(explain({ location: 'granted', notifications: 'granted' })).toBeNull();
  });
});
