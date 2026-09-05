import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";
import { useCallback, useMemo, useRef, type ReactNode } from "react";

import { authClient } from "./auth-client";

/**
 * Custom Better Auth → Convex bridge.
 *
 * Replaces `ConvexBetterAuthProvider` from `@convex-dev/better-auth/react`,
 * which has two bugs that prevent Convex from authenticating on Expo:
 *
 *  1. `fetchAccessToken` is wrapped in `useCallback(..., [sessionId])`. The
 *     server-side session id rotates on every `/convex/token` call, so the
 *     fetcher's identity changes on every render. `ConvexProviderWithAuth`'s
 *     effect depends on that identity; when it changes it runs the cleanup,
 *     which sets `isConvexAuthenticated` back to null/false. The next render
 *     calls `setAuth` again and the cycle repeats. `useConvexAuth().isAuthenticated`
 *     never settles.
 *  2. `cachedToken` is captured by closure inside a `useMemo` whose factory
 *     only re-runs when `authClient` changes (never). State updates don't
 *     reach the inner closure, so the cache is stale.
 *
 * This bridge does the minimum the platform actually needs:
 *  - `isAuthenticated` / `isLoading` come from `authClient.useSession()` directly.
 *  - `fetchAccessToken` is keyed on the signed-in USER id, not the server-side
 *    session id. The session id rotates on every `/convex/token` call, which is
 *    what makes the upstream version loop; a user id is stable for as long as
 *    the same person is signed in. Keying on it is what makes the guest ->
 *    account upgrade work: both states are authenticated, so `isAuthenticated`
 *    never flips, and with a `[]` dependency Convex would keep the guest's JWT
 *    after Better Auth deleted that user, leaving every authed query reading as
 *    signed out.
 *  - In-flight calls de-dup via a ref tagged with the user they belong to, so
 *    multiple consumers can't fire parallel `/convex/token` requests and a call
 *    started for the old user can't be handed to the new one.
 *
 * The OAuth one-time-token (`?ott=...`) handling in the upstream provider is
 * a web-only path (`window === undefined` on native), so we don't replicate it.
 */
function useBetterAuthForConvex() {
  const { data: session, isPending } = authClient.useSession();
  const isAuthenticated = !!session?.session;
  const userId = session?.user?.id ?? null;

  const inflightRef = useRef<{ userId: string | null; promise: Promise<string | null> } | null>(
    null,
  );

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken = false }: { forceRefreshToken?: boolean } = {}) => {
      if (!forceRefreshToken && inflightRef.current?.userId === userId) {
        return inflightRef.current.promise;
      }

      // Convex treats one null from this fetcher as "signed out" and clears
      // auth without retrying (authentication_manager `refetchToken`), so a
      // single failed request here leaves the socket unauthenticated until
      // the next auth change. On a phone resuming from lock the first call
      // races the radio waking up, so retry transient failures and return
      // null only when the server genuinely rejects the session.
      const promise = (async () => {
        for (let attempt = 0; ; attempt++) {
          try {
            const { data, error } = await authClient.convex.token({
              fetchOptions: { throw: false },
            });
            if (data?.token) return data.token;
            // 4xx means no valid session: that null is real.
            if (error && error.status >= 400 && error.status < 500) return null;
          } catch {
            // fall through to retry
          }
          if (attempt >= 2) return null;
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        }
      })().finally(() => {
        if (inflightRef.current?.promise === promise) inflightRef.current = null;
      });

      inflightRef.current = { userId, promise };
      return promise;
    },
    [userId],
  );

  return useMemo(
    () => ({
      isLoading: isPending,
      isAuthenticated,
      fetchAccessToken,
    }),
    [isPending, isAuthenticated, fetchAccessToken],
  );
}

export function BetterAuthConvexProvider({
  children,
  client,
}: {
  children: ReactNode;
  client: ConvexReactClient;
}) {
  return (
    <ConvexProviderWithAuth client={client} useAuth={useBetterAuthForConvex}>
      {children}
    </ConvexProviderWithAuth>
  );
}
