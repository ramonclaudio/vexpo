import { describe, expect, it, vi } from "vitest";

// The hook's import chain pulls in react-native via expo modules, which the
// node test env can't parse. Stub the native-touching imports so the module
// loads and we can exercise the pure error-classification helper.
vi.mock("expo-local-authentication", () => ({}));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));
vi.mock("@/lib/haptics", () => ({ haptics: { error: vi.fn() } }));

const { isAuthUnavailable } = await import("@/hooks/use-delete-account");

// The Face ID gate fails for two reasons: the user backed out (retryable), or
// the device has no biometrics and no passcode (terminal). Only the terminal
// case should surface "Device authentication unavailable" so the button stops
// looking dead (Apple 5.1.1(v)).
describe("isAuthUnavailable", () => {
  it("flags terminal unavailability errors", () => {
    expect(isAuthUnavailable("not_available")).toBe(true);
    expect(isAuthUnavailable("not_enrolled")).toBe(true);
    expect(isAuthUnavailable("passcode_not_set")).toBe(true);
  });

  it("ignores retryable and user-driven errors", () => {
    expect(isAuthUnavailable("user_cancel")).toBe(false);
    expect(isAuthUnavailable("system_cancel")).toBe(false);
    expect(isAuthUnavailable("lockout")).toBe(false);
    expect(isAuthUnavailable("authentication_failed")).toBe(false);
  });
});
