import { useEffect } from "react";

import {
  useUpdates,
  isEnabled,
  checkForUpdate as checkForUpdateFn,
  fetchUpdate,
  reload,
  buildReloadScreenConfig,
} from "@/lib/updates";
import { haptics } from "@/lib/haptics";
import { useColorScheme } from "@/hooks/use-theme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type UpdatesState = ReturnType<typeof useUpdates>;

function deriveStatusText(state: UpdatesState): string {
  if (state.isRestarting) return "Restarting...";
  if (state.isUpdatePending) return "Restarting...";
  if (state.isDownloading) {
    const pct =
      state.downloadProgress != null ? ` ${Math.round(state.downloadProgress * 100)}%` : "";
    return `Downloading...${pct}`;
  }
  if (state.isChecking) return "Checking...";
  if (state.downloadError) return state.downloadError.message;
  if (state.checkError) return state.checkError.message;
  if (state.isUpdateAvailable) return "Update available";
  return "Up to date";
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
    haptics.light();
    checkForUpdateFn();
  };

  const downloadAndApply = () => {
    if (state.isDownloading) return;
    haptics.light();
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
