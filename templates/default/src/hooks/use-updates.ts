import { useEffect } from "react";

import {
  useUpdates,
  isEnabled,
  checkForUpdate as checkForUpdateFn,
  fetchUpdate,
  reload,
  buildReloadScreenConfig,
} from "@/lib/updates";
import { useColorScheme } from "@/hooks/use-theme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type UpdatesState = ReturnType<typeof useUpdates>;

// First match wins, so the more specific states come first.
const STATUSES: [(s: UpdatesState) => boolean, (s: UpdatesState) => string][] = [
  [(s) => s.isRestarting || s.isUpdatePending, () => "Restarting..."],
  [
    (s) => s.isDownloading,
    (s) =>
      `Downloading...${s.downloadProgress == null ? "" : ` ${Math.round(s.downloadProgress * 100)}%`}`,
  ],
  [(s) => s.isChecking, () => "Checking..."],
  [(s) => s.downloadError != null, (s) => s.downloadError!.message],
  [(s) => s.checkError != null, (s) => s.checkError!.message],
  [(s) => s.isUpdateAvailable, () => "Update available"],
];

function deriveStatusText(state: UpdatesState): string {
  return STATUSES.find(([match]) => match(state))?.[1](state) ?? "Up to date";
}

const NOOP_STATE: UpdatesState = {
  currentlyRunning: {
    isEmbeddedLaunch: true,
    isEmergencyLaunch: false,
    emergencyLaunchReason: null,
  },
  isStartupProcedureRunning: false,
  isUpdateAvailable: false,
  isUpdatePending: false,
  isChecking: false,
  isDownloading: false,
  isRestarting: false,
  restartCount: 0,
};

function useUpdatesImpl(): UpdatesState {
  const enabled = isEnabled && !__DEV__;
  const state = useUpdates();
  const scheme = useColorScheme();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!enabled) return;
    if (state.isUpdatePending) {
      reload({ reloadScreenOptions: buildReloadScreenConfig(scheme, reduceMotion) });
    }
  }, [enabled, state.isUpdatePending, scheme, reduceMotion]);

  return enabled ? state : NOOP_STATE;
}

export function useAppUpdates() {
  const state = useUpdatesImpl();

  const checkForUpdate = () => {
    if (state.isChecking) return;
    checkForUpdateFn();
  };

  const downloadAndApply = () => {
    if (state.isDownloading) return;
    fetchUpdate();
  };

  const statusText = deriveStatusText(state);

  return {
    ...state,
    checkForUpdate,
    downloadAndApply,
    statusText,
  };
}
