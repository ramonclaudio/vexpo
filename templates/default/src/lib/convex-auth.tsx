import { ConvexProviderWithAuth, type ConvexReactClient } from "convex/react";
import { useCallback, useMemo, useRef, type ReactNode } from "react";

import { authClient } from "./auth-client";

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

      const promise = (async () => {
        for (let attempt = 0; ; attempt++) {
          try {
            const { data, error } = await authClient.convex.token({
              fetchOptions: { throw: false },
            });
            if (data?.token) return data.token;
            if (error && error.status >= 400 && error.status < 500) return null;
          } catch {}
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
