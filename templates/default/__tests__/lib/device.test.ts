/**
 * The app's own sessions are the ones a user most needs to recognise, and they
 * are the ones iOS reports as `<AppName>/1 CFNetwork/... Darwin/...` rather
 * than as "iPhone". Before this, that string reached the sessions list raw.
 */
import { describe, expect, test, vi } from "vitest";

// device.ts reads runtime constants at import time. `deviceLabel` itself is
// pure, so a bare stub is enough to load the module under node, which cannot
// parse react-native's Flow sources.
vi.mock("expo-constants", () => ({ default: {} }));

import { deviceLabel } from "@/lib/device";

describe("deviceLabel", () => {
  test("names the app's own iOS requests instead of printing the User-Agent", () => {
    expect(deviceLabel("Foobar/1 CFNetwork/3860.600.12 Darwin/25.0.0")).toBe("iPhone");
  });

  // CFNetwork is checked before the platform words for this case: the app name
  // leads the string, so a name containing "mac" would otherwise win.
  test("does not call an iPhone a Mac because of the app's name", () => {
    expect(deviceLabel("Macchiato/1 CFNetwork/3860.600.12 Darwin/25.0.0")).toBe("iPhone");
  });

  test("still reads real browser User-Agents", () => {
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)")).toBe("iPhone");
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("Mac");
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 15)")).toBe("Android");
  });

  test("falls back rather than guessing", () => {
    expect(deviceLabel(null)).toBe("Unknown device");
    expect(deviceLabel("")).toBe("Unknown device");
    expect(deviceLabel("something-else")).toBe("something-else");
  });
});
