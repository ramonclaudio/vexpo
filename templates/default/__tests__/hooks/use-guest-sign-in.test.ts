import { describe, expect, it, vi } from "vitest";

const back = vi.fn();
const replace = vi.fn();
const canGoBack = vi.fn();

vi.mock("expo-router", () => ({ router: { back, replace, canGoBack } }));
vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { anonymous: vi.fn() } } }));
vi.mock("@/lib/a11y", () => ({ announce: vi.fn() }));
vi.mock("@/lib/haptics", () => ({
  haptics: { selection: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/hooks/use-auth-status", () => ({ useAuthStatus: () => ({ isGuest: false }) }));

const { dismissAuth, guestSignInError } = await import("@/hooks/use-guest-sign-in");

describe("dismissAuth", () => {
  it("pops when there is somewhere to go back to", () => {
    back.mockClear();
    replace.mockClear();
    canGoBack.mockReturnValue(true);

    dismissAuth();

    expect(back).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
  });

  it("replaces to the tabs root when there is not", () => {
    back.mockClear();
    replace.mockClear();
    canGoBack.mockReturnValue(false);

    dismissAuth();

    expect(replace).toHaveBeenCalledExactlyOnceWith("/");
    expect(back).not.toHaveBeenCalled();
  });
});

describe("guestSignInError", () => {
  it("tells a rate-limited caller to wait", () => {
    expect(guestSignInError(429)).toBe("Too many tries. Wait a minute and tap it again.");
  });

  it("gives one plain line for every other status", () => {
    const plain = "Couldn't start a guest session. Check your connection and try again.";
    for (const status of [400, 401, 403, 404, 500, 502, 503]) {
      expect(guestSignInError(status)).toBe(plain);
    }
  });

  it("gives the same line when the request threw and there is no status", () => {
    expect(guestSignInError()).toBe(guestSignInError(500));
  });

  it("never leaks a status code or a server message into the copy", () => {
    for (const status of [429, 500, undefined]) {
      expect(guestSignInError(status)).not.toMatch(/\d{3}|error|Error|failed/);
    }
  });
});
