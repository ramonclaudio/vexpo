import {
  isEnabled,
  updateId,
  channel,
  runtimeVersion,
  checkAutomatically,
  isEmergencyLaunch,
  emergencyLaunchReason,
  isEmbeddedLaunch,
  manifest,
  createdAt,
  launchDuration,
  checkForUpdateAsync,
  fetchUpdateAsync,
  reloadAsync,
  readLogEntriesAsync,
  clearLogEntriesAsync,
  getExtraParamsAsync,
  setExtraParamAsync,
  setUpdateRequestHeadersOverride,
  setUpdateURLAndRequestHeadersOverride,
  showReloadScreen,
  hideReloadScreen,
  UpdateCheckResultNotAvailableReason,
  UpdatesLogEntryCode,
  UpdatesLogEntryLevel,
  UpdatesCheckAutomaticallyValue,
  UpdateInfoType,
  useUpdates,
} from "expo-updates";

import type { ReloadScreenOptions } from "expo-updates";

export type {
  ReloadScreenOptions,
  ReloadScreenImageSource,
  Manifest,
  UpdateCheckResult,
  UpdateCheckResultAvailable,
  UpdateCheckResultNotAvailable,
  UpdateCheckResultRollBack,
  UpdateFetchResult,
  UpdateFetchResultSuccess,
  UpdateFetchResultFailure,
  UpdateFetchResultRollBackToEmbedded,
  UpdatesLogEntry,
  CurrentlyRunningInfo,
  UpdateInfo,
  UpdateInfoNew,
  UpdateInfoRollback,
  UseUpdatesReturnType,
} from "expo-updates";

export {
  UpdateCheckResultNotAvailableReason,
  UpdatesLogEntryCode,
  UpdatesLogEntryLevel,
  UpdatesCheckAutomaticallyValue,
  UpdateInfoType,
};

export { useUpdates };

export {
  isEnabled,
  updateId,
  channel,
  runtimeVersion,
  checkAutomatically,
  isEmergencyLaunch,
  emergencyLaunchReason,
  isEmbeddedLaunch,
  manifest,
  createdAt,
  launchDuration,
};

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
export const clearLogEntries = clearLogEntriesAsync;
export const getExtraParams = getExtraParamsAsync;
export const setExtraParam = setExtraParamAsync;
export const setRequestHeadersOverride = setUpdateRequestHeadersOverride;
export const setURLAndHeadersOverride = setUpdateURLAndRequestHeadersOverride;

export { showReloadScreen, hideReloadScreen };
