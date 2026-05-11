/** @type {import('expo/fingerprint').Config} */
const config = {
  sourceSkips: [
    "ExpoConfigVersions",
    "ExpoConfigRuntimeVersionIfString",
    "PackageJsonAndroidAndIosScriptsIfNotContainRun",
  ],
};
module.exports = config;
