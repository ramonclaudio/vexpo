import { describe, expect, it, vi } from "vitest";

// Two import-time side effects have to be neutralised before the module loads:
// storage.ts installs a localStorage global from expo-sqlite, and use-theme
// pushes the stored mode at the native window. Same localStorage stub as
// __tests__/lib/storage.test.ts.
vi.mock("expo-sqlite/localStorage/install", () => ({}));

const backing = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
  setItem: (k: string, v: string) => void backing.set(k, v),
  removeItem: (k: string) => void backing.delete(k),
  clear: () => backing.clear(),
  key: () => null,
  length: 0,
} as Storage;

const setColorScheme = vi.fn();
vi.mock("react-native", () => ({
  Appearance: { setColorScheme },
  useColorScheme: () => "light",
  DynamicColorIOS: (v: unknown) => v,
}));
// The palette pulls the navigation theme through expo-router, which does not
// parse in node. Nothing here reads a colour, so an empty theme is enough.
vi.mock("expo-router", () => ({ DefaultTheme: { colors: {} } }));

const { setTheme } = await import("@/hooks/use-theme");

/**
 * `setTheme` is the write half of the theme preference: it persists the choice
 * and pushes it at the native window in the same call. The mapping that
 * matters is "system", which is not a scheme UIKit understands. It has to go
 * over as `unspecified`, or picking System pins the app to whatever was set
 * last instead of following the device.
 */
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
