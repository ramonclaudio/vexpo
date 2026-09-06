import { beforeEach, describe, expect, it, vi } from "vitest";

const announceForAccessibility = vi.fn();
vi.mock("react-native", () => ({
  AccessibilityInfo: { announceForAccessibility: (m: string) => announceForAccessibility(m) },
}));
vi.mock("@/lib/haptics", () => ({ haptics: { error: vi.fn(), success: vi.fn() } }));

const { fail, succeed } = await import("@/lib/form-result");

beforeEach(() => announceForAccessibility.mockClear());

describe("fail", () => {
  it("announces the error it returns", () => {
    expect(fail("Invalid email or password")).toEqual({ error: "Invalid email or password" });
    expect(announceForAccessibility).toHaveBeenCalledWith("Error: Invalid email or password");
  });

  it("announces again when the same error repeats", () => {
    fail("Invalid email or password");
    fail("Invalid email or password");
    expect(announceForAccessibility).toHaveBeenCalledTimes(2);
  });
});

describe("succeed", () => {
  it("announces once, without the error prefix", () => {
    succeed("Signed in");
    expect(announceForAccessibility).toHaveBeenCalledExactlyOnceWith("Signed in");
  });
});
