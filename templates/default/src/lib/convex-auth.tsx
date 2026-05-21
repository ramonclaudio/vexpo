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
 *  - `fetchAccessToken` is identity-stable (`useCallback([])`). The Convex
 *    client caches the JWT internally and re-calls only on expiry/forceRefresh.
 *  - In-flight calls de-dup via a ref, so multiple consumers can't fire
 *    parallel `/convex/token` requests.
 *
 * The OAuth one-time-token (`?ott=...`) handling in the upstream provider is
 * a web-only path (`window === undefined` on native), so we don't replicate it.
 */
function useBetterAuthForConvex() {
  const { data: session, isPending } = authClient.useSession();
  const isAuthenticated = !!session?.session;

  const inflightRef = useRef<Promise<string | null> | null>(null);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken = false }: { forceRefreshToken?: boolean } = {}) => {
      if (!forceRefreshToken && inflightRef.current) return inflightRef.current;

      const promise = authClient.convex
        .token({ fetchOptions: { throw: false } })
        .then(({ data }) => data?.token ?? null)
        .catch(() => null)
        .finally(() => {
          inflightRef.current = null;
        });

      inflightRef.current = promise;
      return promise;
    },
    [],
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
