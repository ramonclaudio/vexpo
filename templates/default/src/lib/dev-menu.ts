import * as DevClient from "expo-dev-client";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";

import { authClient, storagePrefix } from "@/lib/auth-client";

async function copyAuthSessionId() {
  try {
    const res = await authClient.getSession();
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

// The auth cookie and session live in SecureStore, preferences and onboarding in localStorage.
function resetAppData() {
  SecureStore.deleteItemAsync(`${storagePrefix}_cookie`).catch(() => {});
  SecureStore.deleteItemAsync(`${storagePrefix}_session_data`).catch(() => {});
  localStorage.clear();
  console.log("[DevMenu] App data reset. Reload to start fresh");
}

export function registerDevMenuItems() {
  if (!__DEV__) return;

  DevClient.registerDevMenuItems([
    {
      name: "Reset App Data",
      callback: resetAppData,
    },
    {
      name: "Copy Auth Session ID",
      callback: () => {
        void copyAuthSessionId();
      },
      shouldCollapse: true,
    },
    {
      name: "Show Env",
      callback: showPublicEnv,
      shouldCollapse: true,
    },
  ]);
}
