import { useSyncExternalStore } from "react";
import { Appearance, useColorScheme as useRNColorScheme } from "react-native";

import { createStorage } from "@/lib/storage";
import { Colors, type ColorPalette } from "@/constants/theme";

type ThemeMode = "light" | "dark" | "system";

const store = createStorage<ThemeMode>("pref.theme.mode", "system");

function applyToWindow(mode: ThemeMode) {
  Appearance.setColorScheme(mode === "system" ? "unspecified" : mode);
}

applyToWindow(store.get());

export function setTheme(mode: ThemeMode) {
  store.set(mode);
  applyToWindow(mode);
}

export function useColorScheme(): "light" | "dark" {
  const mode = useSyncExternalStore(store.subscribe, store.get, store.get);
  const systemScheme = useRNColorScheme();
  if (mode === "system") return systemScheme === "dark" ? "dark" : "light";
  return mode;
}

export function useThemeMode(): {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
} {
  const mode = useSyncExternalStore(store.subscribe, store.get, store.get);
  return { mode, setMode: setTheme };
}

export function useColors(): ColorPalette {
  return Colors;
}

export function useThemedAsset<L, D>(light: L, dark: D): L | D {
  const scheme = useColorScheme();
  return scheme === "dark" ? dark : light;
}
