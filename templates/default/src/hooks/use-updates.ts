import { useEffect } from "react";
import {
  fetchUpdateAsync,
  isEnabled,
  reloadAsync,
  useUpdates,
  type ReloadScreenOptions,
} from "expo-updates";

import { useColorScheme } from "@/hooks/use-theme";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

type UpdatesState = ReturnType<typeof useUpdates>;

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

// The reload screen is drawn natively, so it takes plain hex, not the palette.
function reloadScreenOptions(scheme: "light" | "dark", reduceMotion: boolean): ReloadScreenOptions {
  const dark = scheme === "dark";
  return {
    backgroundColor: dark ? "#0A0A0A" : "#FFFFFF",
    fade: !reduceMotion,
    spinner: { color: dark ? "#FFFFFF" : "#0E0E0E", enabled: true, size: "medium" },
  };
}

export function useAppUpdates() {
  const enabled = isEnabled && !__DEV__;
  const live = useUpdates();
  const scheme = useColorScheme();
  const reduceMotion = useReducedMotion();
  const state = enabled ? live : NOOP_STATE;

  useEffect(() => {
    if (enabled && state.isUpdatePending) {
      reloadAsync({ reloadScreenOptions: reloadScreenOptions(scheme, reduceMotion) });
    }
  }, [enabled, state.isUpdatePending, scheme, reduceMotion]);

  const downloadAndApply = () => {
    if (!enabled || state.isDownloading) return;
    fetchUpdateAsync();
  };

  return { ...state, downloadAndApply };
}
