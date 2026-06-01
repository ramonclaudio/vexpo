import { useEffect, useRef } from "react";
import { useURL } from "expo-linking";
import { router, type Href } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { resolveDeepLink } from "@/lib/deep-link";

/**
 * Resumes a deep link that arrived BEFORE the user authenticated. Links that
 * arrive while authenticated are navigated by `+native-intent.tsx` (expo-router
 * runs `redirectSystemPath` and drives the navigator itself, query included),
 * so this hook must not re-navigate them or every tap would double-push and
 * stack a phantom copy of the destination. It handles only the deferred case:
 * an incoming URL whose navigation the auth guard blocked, replayed once
 * sign-in completes.
 */
export function useDeepLinkHandler() {
  // See note in app/_layout.tsx: Better Auth session is the canonical signal.
  // `useConvexAuth` is unreliable due to the bridge's sessionId churn.
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.session;
  const url = useURL();
  const pendingUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!url) return;

    if (!isAuthenticated) {
      // native-intent's navigation to a protected route was blocked by the
      // auth guard; remember the link so we can resume it after sign-in.
      pendingUrl.current = url;
      return;
    }

    // Authenticated. Act only on a link that arrived while unauthenticated;
    // links that arrive while authed are already navigated by native-intent.
    if (pendingUrl.current !== url) return;
    pendingUrl.current = null;

    let resolved;
    try {
      resolved = resolveDeepLink(url);
    } catch (err) {
      if (__DEV__) console.warn("[DeepLink] parse failed:", err);
      return;
    }

    if (!resolved.href) return;
    router.push({ pathname: resolved.href, params: resolved.params } as Href);
  }, [isAuthenticated, url]);
}
