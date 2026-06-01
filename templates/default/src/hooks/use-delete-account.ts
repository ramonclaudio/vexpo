import { useCallback, useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { formatError } from "@/components/ui/convex-error";
import { haptics } from "@/lib/haptics";

// Face ID gate, soft-delete mutation, and sign-out for account deletion, shared
// by the profile and settings screens. The mutation can reject (rate limit,
// network, server); on failure the caller surfaces `deleteError` instead of
// leaving the user on an unchanged screen after confirming a destructive action.
export function useDeleteAccount() {
  const deleteAccountMutation = useMutation(api.users.deleteAccount);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteAccount = useCallback(async () => {
    haptics.error();
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Confirm with Face ID",
    });
    if (!result.success) return;
    try {
      setDeleteError(null);
      await deleteAccountMutation();
      await authClient.signOut();
    } catch (err) {
      haptics.error();
      setDeleteError(formatError(err));
    }
  }, [deleteAccountMutation]);

  return { deleteAccount, deleteError };
}
