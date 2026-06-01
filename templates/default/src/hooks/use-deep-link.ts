import { useEffect } from "react";
import { useURL } from "expo-linking";
import { router, type Href } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { resolveDeepLink } from "@/lib/deep-link";

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

    if (!resolved.href) return;
    router.push({ pathname: resolved.href, params: resolved.params } as Href);
  }, [isAuthenticated, url]);
}
