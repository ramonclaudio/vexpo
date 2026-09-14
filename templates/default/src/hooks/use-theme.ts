import { Appearance, useColorScheme as useRNColorScheme } from "react-native";

import { createStorage, isOneOf, useStore } from "@/lib/storage";

type ThemeMode = "light" | "dark" | "system";

const store = createStorage<ThemeMode>(
  "pref.theme.mode",
  "system",
  isOneOf("light", "dark", "system"),
);

function applyToWindow(mode: ThemeMode) {
  Appearance.setColorScheme(mode === "system" ? "unspecified" : mode);
}

applyToWindow(store.get());

function setTheme(mode: ThemeMode) {
  store.set(mode);
  applyToWindow(mode);
}

export function useColorScheme(): "light" | "dark" {
  const mode = useStore(store);
  const systemScheme = useRNColorScheme();
  if (mode === "system") return systemScheme === "dark" ? "dark" : "light";
  return mode;
}

export function useThemeMode(): {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
} {
  const mode = useStore(store);
  return { mode, setMode: setTheme };
}
