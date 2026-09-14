import { useEffect, useRef } from "react";
import { useURL } from "expo-linking";
import { router, type Href } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { resolveDeepLink } from "@/lib/deep-link";

export function useDeepLinkHandler() {
  const { data: session } = authClient.useSession();
  const isAuthenticated = !!session?.session;
  const url = useURL();
  const pendingUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!url) return;

    if (!isAuthenticated) {
      pendingUrl.current = url;
      return;
    }

    if (pendingUrl.current !== url) return;
    pendingUrl.current = null;

    // Auth links already opened their screen while signed out, and the auth stack is gone now.
    const resolved = resolveDeepLink(url);
    if (!resolved.href || resolved.href.startsWith("/auth/")) return;
    router.push({ pathname: resolved.href, params: resolved.params } as Href);
  }, [isAuthenticated, url]);
}
