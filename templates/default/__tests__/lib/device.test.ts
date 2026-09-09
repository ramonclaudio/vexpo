import { describe, expect, test, vi } from "vitest";

vi.mock("expo-constants", () => ({ default: {} }));

import { deviceLabel } from "@/lib/device";

describe("deviceLabel", () => {
  test("names the app's own iOS requests instead of printing the User-Agent", () => {
    expect(deviceLabel("Foobar/1 CFNetwork/3860.600.12 Darwin/25.0.0")).toBe("iPhone");
  });

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
