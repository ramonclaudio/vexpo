import { authClient } from "@/lib/auth-client";

export type AuthStatus = {
  isPending: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  hasAccount: boolean;
  name: string | null;
};

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
