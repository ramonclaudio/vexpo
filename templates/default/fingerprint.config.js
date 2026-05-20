/** @type {import('expo/fingerprint').Config} */
const config = {
  sourceSkips: [
    "ExpoConfigVersions",
    "ExpoConfigRuntimeVersionIfString",
    "PackageJsonAndroidAndIosScriptsIfNotContainRun",
  ],
  // Switch the react-native autolinking source from `expo-modules-autolinking`
  // to `@react-native-community/cli`. The default expo variant emits per-package
  // directory hashes for `react-native-reanimated` and `react-native-worklets`
  // tagged `rncoreAutolinkingIos`, and those hashes drift between developer
  // machines and EAS Build's worker (same npm packages, same lockfile, but the
  // expo autolinker produces different content cross-environment). With the
  // community/cli variant, the autolinker emits a single content-addressed
  // `expoAutolinkingConfig:ios` JSON source instead — package versions in,
  // hash out. Real native version bumps still flip the fingerprint via the
  // version strings inside that JSON. Pair this with `.fingerprintignore`
  // pinning `expo-modules-jsi/apple/**` — without both levers `eas build`
  // fails `CONFIGURE_EXPO_UPDATES` with a `Runtime version calculated on local
  // machine not equal to runtime version calculated during build` error.
  useRNCoreAutolinkingFromExpo: false,
};
module.exports = config;
