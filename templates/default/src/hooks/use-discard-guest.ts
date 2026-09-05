import { useCallback, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { formatError } from "@/lib/convex-error";
import { haptics } from "@/lib/haptics";

/**
 * Ends a guest session and purges everything behind it.
 *
 * The account version of this soft-deletes and gives the user 30 days to sign
 * back in and undo it. A guest has no email and no password, so there is
 * nothing to sign back in with and no window worth opening. This purges on the
 * spot, which is also what makes leaving guest mode an in-app account deletion
 * (Apple 5.1.1(v)) rather than a dead row we keep. No Face ID prompt: there is
 * no identity to confirm, only the confirmation dialog the caller shows.
 */
export function useDiscardGuest() {
  const discardMutation = useMutation(api.users.discardGuest);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const discardGuest = useCallback(async () => {
    setDiscardError(null);
    haptics.error();
    try {
      await discardMutation();
      await authClient.signOut();
    } catch (err) {
      haptics.error();
      setDiscardError(formatError(err));
    }
  }, [discardMutation]);

  return { discardGuest, discardError };
}
