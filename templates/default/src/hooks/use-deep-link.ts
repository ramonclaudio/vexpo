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
