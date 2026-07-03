import {
  isEnabled,
  checkForUpdateAsync,
  fetchUpdateAsync,
  reloadAsync,
  readLogEntriesAsync,
  useUpdates,
} from "expo-updates";

import type { ReloadScreenOptions } from "expo-updates";

export type { UpdatesLogEntry } from "expo-updates";

export { useUpdates, isEnabled };

export function buildReloadScreenConfig(
  scheme: "light" | "dark",
  reduceMotion = false,
): ReloadScreenOptions {
  const dark = scheme === "dark";
  return {
    // Match the app's dark background (theme.ts NEUTRAL.n950) so the reload
    // screen hands off to the app with no seam. NEUTRAL isn't exported.
    backgroundColor: dark ? "#0A0A0A" : "#FFFFFF",
    fade: !reduceMotion,
    spinner: { color: dark ? "#FFFFFF" : "#0E0E0E", enabled: true, size: "medium" },
  };
}

export const checkForUpdate = isEnabled ? checkForUpdateAsync : async () => {};
export const fetchUpdate = isEnabled ? fetchUpdateAsync : async () => {};
export const reload = reloadAsync;
export const readLogEntries = readLogEntriesAsync;
