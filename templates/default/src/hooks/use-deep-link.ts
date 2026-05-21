import { useEffect } from "react";
import { useURL } from "expo-linking";
import { router, type Href } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { resolveDeepLink } from "@/lib/deep-link";

const ROUTES: Record<string, Href> = {
  "/linked": "/linked" as Href,
};

/**
 * Listens for deep link URLs and pushes to the matching route.
 *
 * Only runs once authenticated. Invalid or disallowed links are ignored.
 * Query params are forwarded as route params.
 */
export function useDeepLinkHandler() {
  // See note in app/_layout.tsx: Better Auth session is the canonical signal.
  // `useConvexAuth` is unreliable due to the bridge's sessionId churn.
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.session;
  const url = useURL();

  useEffect(() => {
    if (!isAuthenticated || !url) return;

    let resolved;
    try {
      resolved = resolveDeepLink(url);
    } catch (err) {
      if (__DEV__) console.warn("[DeepLink] parse failed:", err);
      return;
    }

    if (!resolved.path) return;

    const target = ROUTES[resolved.path];
    if (!target) return;

    router.push({ pathname: target, params: resolved.params } as Href);
  }, [isAuthenticated, url]);
}
