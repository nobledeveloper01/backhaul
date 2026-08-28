/**
 * `AsyncStorage` in a test, backed by a Map.
 *
 * The package has no native module under Jest and every call throws with a
 * stack pointing into `createAsyncStorage.native.ts`, which says nothing about
 * what to do. Version 3 ships no mock of its own, so this is one — small, in
 * memory, and cleared between tests by the suites that care.
 *
 * It is a real implementation rather than `jest.fn()` stubs on purpose: the
 * thing under test in `offlineDelivery.test.tsx` is that a draft *survives*
 * the component being destroyed, and a stub returning undefined would let that
 * test pass while proving nothing.
 *
 * `Promise.resolve` rather than `async`, because every one of these is
 * synchronous underneath and lint is right that an async function with no
 * await is a promise of something it is not doing.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  const read = (key) => (store.has(key) ? store.get(key) : null);

  return {
    __esModule: true,
    default: {
      getItem: (key) => Promise.resolve(read(key)),
      setItem: (key, value) => Promise.resolve(store.set(key, String(value))).then(() => undefined),
      removeItem: (key) => Promise.resolve(store.delete(key)).then(() => undefined),
      clear: () => Promise.resolve(store.clear()),
      getAllKeys: () => Promise.resolve([...store.keys()]),
      getMany: (keys) => Promise.resolve(keys.map((key) => [key, read(key)])),
      setMany: (entries) =>
        Promise.resolve(
          Object.entries(entries).forEach(([key, value]) => store.set(key, String(value))),
        ),
      multiGet: (keys) => Promise.resolve(keys.map((key) => [key, read(key)])),
      multiSet: (pairs) =>
        Promise.resolve(pairs.forEach(([key, value]) => store.set(key, String(value)))),
      multiRemove: (keys) => Promise.resolve(keys.forEach((key) => store.delete(key))),
    },
  };
});
