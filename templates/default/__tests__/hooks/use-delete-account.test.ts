import { describe, expect, it, vi } from "vitest";

vi.mock("expo-local-authentication", () => ({}));
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));
vi.mock("@/lib/haptics", () => ({ haptics: { error: vi.fn() } }));
vi.mock("@/lib/a11y", () => ({ announce: vi.fn() }));

const { isAuthUnavailable } = await import("@/hooks/use-delete-account");

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
