const path = require('node:path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const workspaceRoot = path.resolve(__dirname, '../..');

/**
 * Metro, taught about the monorepo.
 *
 * Two things are needed and neither is the default:
 *
 * - `watchFolders` must include the workspace root, or a change to
 *   `packages/domain` will not trigger a reload and you will spend ten minutes
 *   wondering why an edit did nothing.
 * - `nodeModulesPaths` must include the root's `node_modules`, because
 *   `.npmrc` sets `node-linker=hoisted` and most packages live there rather
 *   than beside the app.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    // The domain package is TypeScript source; Metro compiles it like any
    // other source file, so the app never consumes a stale `dist`.
    unstable_enablePackageExports: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
