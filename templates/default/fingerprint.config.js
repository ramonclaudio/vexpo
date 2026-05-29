// Stability for the `fingerprint` runtime version policy.
//
// react-native core autolinking deps are hashed by their package.json, not their
// whole dir, via patches/@expo+fingerprint+0.19.3.patch (expo/expo#46356). EAS
// workers write pod-install and codegen artifacts into node_modules/<dep>, so the
// old dir hash drifted from a pristine local one and failed the build at
// CONFIGURE_EXPO_UPDATES. A version bump still flips the hash and the
// rncoreAutolinkingConfig source still captures resolved native config. Only
// build-artifact churn stops counting. Drop the patch once the fix ships in a
// released @expo/fingerprint.

/** @type {import('expo/fingerprint').Config} */
const config = {
  sourceSkips: [
    "ExpoConfigVersions",
    "ExpoConfigRuntimeVersionIfString",
    "PackageJsonAndroidAndIosScriptsIfNotContainRun",
    // EAS project metadata isn't native code, just an identifier for where
    // OTA updates publish to. The `extra.eas.projectId` field reaches the
    // resolved config either via `app.json` (after `eas init`) or via the
    // `EAS_PROJECT_ID` env fallback in `app.config.ts`. Skipping it here keeps
    // the fingerprint stable when those sources disagree (e.g. a fresh fork
    // sets the env var before running `eas init`, or a multi-account setup
    // resolves to a different project id locally vs on EAS Build).
    "ExpoConfigEASProject",
  ],
};
module.exports = config;
