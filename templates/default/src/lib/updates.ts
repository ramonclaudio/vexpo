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
    backgroundColor: dark ? "#0E0E0E" : "#FFFFFF",
    fade: !reduceMotion,
    spinner: { color: dark ? "#FFFFFF" : "#0E0E0E", enabled: true, size: "medium" },
  };
}

export const checkForUpdate = isEnabled ? checkForUpdateAsync : async () => {};
export const fetchUpdate = isEnabled ? fetchUpdateAsync : async () => {};
export const reload = reloadAsync;
export const readLogEntries = readLogEntriesAsync;
