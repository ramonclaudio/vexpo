const { getDefaultConfig } = require("expo/metro-config");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.blockList = [/\.env\.convex\.local$/];

config.transformer.minifierConfig = {
  compress: {
    drop_console: ["log", "info"],
  },
};

module.exports = config;
