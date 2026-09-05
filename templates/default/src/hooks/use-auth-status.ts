import { authClient } from "@/lib/auth-client";

export type AuthStatus = {
  /** The session is still resolving. Everything below is false until it lands. */
  isPending: boolean;
  /** Any session, guest included. This is what Convex queries need. */
  isAuthenticated: boolean;
  /** Signed in anonymously: browsing works, account-owned screens don't. */
  isGuest: boolean;
  /** A real account. The gate for sessions and password change. */
  hasAccount: boolean;
  /** The session's display name, `null` when signed out. */
  name: string | null;
};

/**
 * One read of the session for every screen that has to tell a guest from a
 * real account. `isAuthenticated` stays the Convex gate (a guest holds a real
 * JWT and every authQuery works for them), and `hasAccount` is the new one.
 */
export function useAuthStatus(): AuthStatus {
  const { data: session, isPending } = authClient.useSession();
  const isAuthenticated = !!session?.session;
  const isGuest = isAuthenticated && session?.user?.isAnonymous === true;
  return {
    isPending,
    isAuthenticated,
    isGuest,
    hasAccount: isAuthenticated && !isGuest,
    name: session?.user?.name ?? null,
  };
}
