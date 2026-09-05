import { useCallback, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { formatError } from "@/lib/convex-error";
import { haptics } from "@/lib/haptics";

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
