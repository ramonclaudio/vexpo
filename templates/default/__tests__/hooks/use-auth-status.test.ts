import { describe, expect, it, vi } from "vitest";

const useSession = vi.fn();
vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: () => useSession() } }));

const { useAuthStatus } = await import("@/hooks/use-auth-status");

const session = (user: Record<string, unknown> | null) =>
  user ? { session: { id: "sess_1" }, user } : null;

describe("useAuthStatus", () => {
  it("reports nothing while the session is still resolving", () => {
    useSession.mockReturnValue({ data: null, isPending: true });
    expect(useAuthStatus()).toEqual({
      isPending: true,
      isAuthenticated: false,
      isGuest: false,
      hasAccount: false,
      name: null,
    });
  });

  it("reports signed out once it settles with no session", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    expect(useAuthStatus()).toMatchObject({
      isPending: false,
      isAuthenticated: false,
      isGuest: false,
      hasAccount: false,
    });
  });

  it("treats a guest as authenticated but without an account", () => {
    useSession.mockReturnValue({
      data: session({ id: "u_1", name: "Guest", isAnonymous: true }),
      isPending: false,
    });
    expect(useAuthStatus()).toEqual({
      isPending: false,
      isAuthenticated: true,
      isGuest: true,
      hasAccount: false,
      name: "Guest",
    });
  });

  it("treats a real account as both", () => {
    useSession.mockReturnValue({
      data: session({ id: "u_2", name: "Ada Lovelace", isAnonymous: false }),
      isPending: false,
    });
    expect(useAuthStatus()).toEqual({
      isPending: false,
      isAuthenticated: true,
      isGuest: false,
      hasAccount: true,
      name: "Ada Lovelace",
    });
  });

  it("treats a missing isAnonymous as an account, not a guest", () => {
    useSession.mockReturnValue({ data: session({ id: "u_3", name: "Ada" }), isPending: false });
    expect(useAuthStatus()).toMatchObject({ isGuest: false, hasAccount: true });
  });

  it("only trusts isAnonymous when it is exactly true", () => {
    for (const value of [null, undefined, 0, "", "false"]) {
      useSession.mockReturnValue({
        data: session({ id: "u_4", name: "Ada", isAnonymous: value }),
        isPending: false,
      });
      expect(useAuthStatus().isGuest).toBe(false);
    }
  });

  it("never claims a session from a user object with no session", () => {
    useSession.mockReturnValue({ data: { user: { id: "u_5", name: "Ada" } }, isPending: false });
    expect(useAuthStatus()).toMatchObject({ isAuthenticated: false, hasAccount: false });
  });

  it("returns a null name when signed out", () => {
    useSession.mockReturnValue({ data: null, isPending: false });
    expect(useAuthStatus().name).toBeNull();
  });
});
