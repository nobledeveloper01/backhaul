module.exports = {
  // RN 0.87 moved the preset out of the `react-native` package itself, so
  // `preset: 'react-native'` now fails with a message about a missing
  // jest-preset.js that does not say where it went.
  preset: '@react-native/jest-preset',
  // The domain package is TypeScript source consumed directly, exactly as
  // Metro consumes it, so a test and the app agree about what they are running.
  moduleNameMapper: {
    '^@backhaul/domain$': '<rootDir>/../../packages/domain/src/index.ts',
  },
  // Packages that ship untranspiled ESM and have to go through Babel.
  // `async-storage` is the one that surfaced this: every test that touched the
  // theme died on "Cannot use import statement outside a module", pointing at
  // a file nobody in this repository wrote.
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@backhaul|@react-native-async-storage)/)',
  ],
};
