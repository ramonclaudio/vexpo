import { describe, expect, it, vi } from "vitest";

import { backing, installLocalStorage } from "../helpers/local-storage.ts";

vi.mock("expo-sqlite/localStorage/install", () => ({}));

installLocalStorage();

const setColorScheme = vi.fn();
vi.mock("react-native", () => ({
  Appearance: { setColorScheme },
  useColorScheme: () => "light",
  DynamicColorIOS: (v: unknown) => v,
}));
vi.mock("expo-router", () => ({ DefaultTheme: { colors: {} } }));

const { setTheme } = await import("@/hooks/use-theme");

const STORAGE_KEY = "pref.theme.mode";

describe("setTheme", () => {
  it("persists the mode so it survives a relaunch", () => {
    setTheme("dark");
    expect(backing.get(STORAGE_KEY)).toBe(JSON.stringify("dark"));
    setTheme("light");
    expect(backing.get(STORAGE_KEY)).toBe(JSON.stringify("light"));
  });

  it("passes an explicit mode straight to the window", () => {
    setColorScheme.mockClear();
    setTheme("dark");
    expect(setColorScheme).toHaveBeenCalledExactlyOnceWith("dark");
  });

  it("sends `system` over as unspecified, not as a scheme", () => {
    setColorScheme.mockClear();
    setTheme("system");
    expect(setColorScheme).toHaveBeenCalledExactlyOnceWith("unspecified");
    expect(backing.get(STORAGE_KEY)).toBe(JSON.stringify("system"));
  });
});
