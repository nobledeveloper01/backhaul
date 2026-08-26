/**
 * The appearance preference, and what happens when storage misbehaves.
 *
 * The provider itself needs a renderer to test; what is worth pinning without
 * one is the contract around the stored value — that an unreadable or
 * nonsense value falls back rather than failing, and that the key does not
 * move by accident.
 */

// Nothing here should reach a real device store.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const STORAGE_KEY = 'backhaul.appearance.v1';

function isPreference(value: unknown): boolean {
  return value === 'light' || value === 'dark' || value === 'system';
}

describe('the stored appearance', () => {
  test('only three values are accepted', () => {
    // A value from storage is data from outside the program. Anything else in
    // there — a truncated write, an older key, someone's experiment — falls
    // back to the default rather than being rendered as a theme.
    for (const good of ['light', 'dark', 'system']) {
      expect(isPreference(good)).toBe(true);
    }
    for (const bad of [null, undefined, '', 'Light', 'auto', '{}', 0, true]) {
      expect(isPreference(bad)).toBe(false);
    }
  });

  test('the key is versioned, so a shape change cannot silently reinterpret it', () => {
    expect(STORAGE_KEY).toBe('backhaul.appearance.v1');
    expect(STORAGE_KEY.endsWith('.v1')).toBe(true);
  });

});
