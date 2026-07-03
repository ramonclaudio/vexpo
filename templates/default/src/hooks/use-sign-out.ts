import { useCallback } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { haptics } from "@/lib/haptics";

// Push-token cleanup is best-effort. A stale token gets garbage-collected by
// `pushTokens.cleanupStale` after 30 days, so don't gate sign-out on it.
export function useSignOut() {
  const removeAllTokens = useMutation(api.pushTokens.removeAll);
  return useCallback(async () => {
    haptics.medium();
    try {
      await removeAllTokens();
    } catch (err) {
      if (__DEV__) console.warn("[signOut] removeAllTokens failed:", err);
    }
    await authClient.signOut();
  }, [removeAllTokens]);
}
