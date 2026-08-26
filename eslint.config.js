// @ts-check
import tseslint from 'typescript-eslint';

/**
 * The boundary rule is the reason this file exists.
 *
 * `packages/domain` is pure TypeScript and its value is entirely in staying
 * that way. Purity enforced by convention lasts until the first person needs a
 * device id at 6pm on a Friday, so it is enforced here instead — see ADR-0001.
 */
const DOMAIN_MUST_NOT_IMPORT = [
  'react',
  'react-native',
  'react-native-*',
  '@react-native/*',
  '@react-navigation/*',
  'expo',
  'expo-*',
  '@backhaul/app',
  'op-sqlite',
  '@op-engineering/*',
  'zustand',
  '@tanstack/*',
  'maplibre-gl',
  '@maplibre/*',
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**'],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    // This file is config, not source, and belongs to no tsconfig. Type-aware
    // linting of the thing that configures type-aware linting is a knot with
    // nothing at the end of it.
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // This file is config, not source, and belongs to no tsconfig.
          allowDefaultProject: ['eslint.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['packages/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: DOMAIN_MUST_NOT_IMPORT,
              message:
                'The domain package is pure TypeScript. Take the value as an ' +
                'argument instead of reaching for the platform — see ADR-0001.',
            },
          ],
        },
      ],
      // A domain that reads the clock cannot be tested against a nine-hour
      // trip in a millisecond, and cannot be replayed against a dispute that
      // has already happened. Every engine here takes `now` as an argument.
      //
      // Banning the `Date` global outright was the first attempt and it was
      // wrong: projecting an arrival *is* `new Date(now.getTime() + ms)`.
      // What must not happen is reading the clock, which is these two shapes.
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message:
            'Take `now: Date` as an argument rather than reading the clock.',
        },
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message:
            'Take `now: Date` as an argument rather than reading the clock.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message:
            'A domain engine must be deterministic. Pass the value in.',
        },
      ],
    },
  },
  {
    // Tests build the clock they are testing against, so they may construct
    // dates freely.
    files: ['**/test/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      'no-restricted-globals': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      // `node:test`'s `test()` and `describe()` return promises that the
      // runner itself awaits. Every call in every test file is a "floating
      // promise" by this rule's reckoning, and none of them is a bug.
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
);
