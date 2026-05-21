import { router, usePathname } from "expo-router";
import { useEffect } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

/**
 * Route guard for the soft-delete window.
 *
 *   - When `getMe.deletedAt` is set and we're not already on
 *     `/restore-account`, push the user there so they can pick between
 *     restore and continue-with-deletion.
 *   - When `deletedAt` is cleared (the user just restored, or another
 *     device restored, or the cron purged the tombstone and they got a
 *     new account) and we're sitting on `/restore-account`, route back
 *     to the home tab.
 *
 * Runs once at the top of `(app)/_layout.tsx`. Unauthenticated users
 * never reach the guard because the root `Stack.Protected` keeps them
 * in `(auth)`.
 */
export function useAccountDeletionGuard(): void {
  const me = useQuery(api.users.getMe);
  const pathname = usePathname();

  useEffect(() => {
    if (me === undefined) return; // loading
    const isTombstoned = !!me?.deletedAt;
    const onRestoreScreen = pathname === "/restore-account";

    if (isTombstoned && !onRestoreScreen) {
      router.replace("/restore-account");
      return;
    }
    if (!isTombstoned && onRestoreScreen) {
      router.replace("/");
    }
  }, [me, pathname]);
}
