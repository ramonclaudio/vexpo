import { describe, expect, it, vi } from "vitest";

vi.mock("expo-apple-authentication", () => ({
  isAvailableAsync: vi.fn(),
  signInAsync: vi.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { social: vi.fn() } } }));
vi.mock("@/lib/haptics", () => ({ haptics: { light: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/a11y", () => ({ announce: vi.fn() }));

const { appleErrorMessage } = await import("@/hooks/use-apple-auth");

function appleError(code: string, reason: string) {
  const e = new Error(
    `${reason} (at ExpoAppleAuthentication/AppleAuthenticationExceptions.swift:61)`,
  );
  return Object.assign(e, { code });
}

describe("appleErrorMessage", () => {
  it("gives every mapped code plain copy", () => {
    const codes = [
      "ERR_REQUEST_UNKNOWN",
      "ERR_REQUEST_FAILED",
      "ERR_INVALID_RESPONSE",
      "ERR_REQUEST_NOT_HANDLED",
      "ERR_REQUEST_NOT_INTERACTIVE",
    ];
    for (const code of codes) {
      expect(appleErrorMessage(appleError(code, "The authorization attempt failed"))).toMatch(
        /Please try again\.$/,
      );
    }
  });

  it("falls back for an unmapped code, a bare error and a non-error", () => {
    for (const thrown of [
      appleError("ERR_REQUEST_MATCHED_EXCLUDED_CREDENTIAL", "This request matched"),
      new Error("boom"),
      "boom",
      undefined,
    ]) {
      expect(appleErrorMessage(thrown)).toBe(
        "Apple sign-in didn't go through. Please try again, or use your email.",
      );
    }
  });

  it("never leaks the Swift reason, the exception name or the source file", () => {
    const thrown = appleError(
      "ERR_REQUEST_UNKNOWN",
      "RequestUnknownException: The authorization attempt failed for an unknown reason",
    );
    const message = appleErrorMessage(thrown);
    expect(message).not.toContain("Exception");
    expect(message).not.toContain(".swift");
    expect(message).not.toContain("authorization attempt");
  });
});
