const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Extend, don't replace: Expo's default blockList excludes `.expo/types`
// (prevents spurious Fast Refresh on generated typed-routes declarations),
// `ios/Pods`, and Metro's `__tests__` dir. Reassigning would drop all of those.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : [config.resolver.blockList]),
  /\.env\.convex\.local$/,
];

// Extend, don't replace: Expo sets keep_fnames/keep_classnames/ascii_only here.
// Reassigning would drop them and break libraries that read fn/constructor names.
config.transformer.minifierConfig = {
  ...config.transformer.minifierConfig,
  compress: {
    ...config.transformer.minifierConfig?.compress,
    drop_console: ["log", "info"],
  },
};

module.exports = config;
