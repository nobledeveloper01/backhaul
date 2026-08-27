/**
 * Where the bundled fonts live.
 *
 * `npx react-native-asset` reads this and copies the files into the iOS
 * bundle and Android `res/font`, and adds the iOS `UIAppFonts` entries. It has
 * to be re-run whenever a file is added here — the linking is a build-time
 * copy, not a runtime lookup, so a font added and not linked is a font that
 * silently falls back to the system face.
 */
module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./assets/fonts'],
};
