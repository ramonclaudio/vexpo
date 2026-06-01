import * as DevClient from "expo-dev-client";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { checkForUpdateAsync } from "expo-updates";

import { authClient } from "@/lib/auth-client";
import { checkForUpdate } from "@/lib/updates";
import { setTheme } from "@/hooks/use-theme";
import { reloadApp } from "./app";

type SessionResponse = { data?: { session?: { id?: string } } | null };

async function copyAuthSessionId() {
  try {
    const res = (await authClient.getSession()) as SessionResponse;
    const id = res?.data?.session?.id;
    if (!id) {
      console.log("[DevMenu] No active auth session");
      return;
    }
    await Clipboard.setStringAsync(id);
    console.log("[DevMenu] Auth session ID copied:", id);
  } catch (err) {
    console.log("[DevMenu] Failed to copy session ID:", err);
  }
}

function showPublicEnv() {
  const keys = Object.keys(process.env).filter((k) => k.startsWith("EXPO_PUBLIC_"));
  const snapshot: Record<string, string | undefined> = {};
  for (const k of keys) snapshot[k] = process.env[k];
  console.log("[DevMenu] EXPO_PUBLIC_* env:", snapshot);
}

function clearLocalStorage() {
  const ls = (globalThis as { localStorage?: Storage }).localStorage;
  if (!ls) {
    console.log("[DevMenu] localStorage unavailable on native");
    return;
  }
  ls.clear();
  console.log("[DevMenu] localStorage cleared");
}

export function registerDevMenuItems() {
  if (!__DEV__) return;

  DevClient.registerDevMenuItems([
    {
      name: "Clear Secure Storage",
      callback: () => {
        SecureStore.deleteItemAsync("better-auth_session_token").catch(() => {});
        SecureStore.deleteItemAsync("better-auth_refresh_token").catch(() => {});
        console.log("[DevMenu] Secure storage cleared");
      },
    },
    {
      name: "Reset Theme",
      callback: () => {
        setTheme("system");
        console.log("[DevMenu] Theme reset to system");
      },
    },
    {
      name: "Copy Session ID",
      callback: () => {
        Clipboard.setStringAsync(Constants.sessionId);
        console.log("[DevMenu] Session ID copied:", Constants.sessionId);
      },
      shouldCollapse: true,
    },
    {
      name: "Copy Auth Session ID",
      callback: () => {
        void copyAuthSessionId();
      },
      shouldCollapse: true,
    },
    {
      name: "Check for Updates",
      callback: () => {
        checkForUpdate()
          .then((result) => console.log("[DevMenu] Update check:", result))
          .catch((err) => console.log("[DevMenu] Update check unavailable:", err.message));
      },
    },
    {
      name: "Force OTA Update Check",
      callback: () => {
        checkForUpdateAsync()
          .then((result) => console.log("[DevMenu] Forced update check:", result))
          .catch((err) =>
            console.log("[DevMenu] Forced update check failed:", err?.message ?? err),
          );
      },
    },
    {
      name: "Clear localStorage",
      callback: clearLocalStorage,
    },
    {
      name: "Show Env",
      callback: showPublicEnv,
      shouldCollapse: true,
    },
    {
      name: "Reload App",
      callback: () => {
        reloadApp();
      },
      shouldCollapse: true,
    },
  ]);
}
