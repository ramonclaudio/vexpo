import { useCallback, useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import type { LocalAuthenticationError } from "expo-local-authentication";
import { useMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { formatError } from "@/lib/convex-error";
import { haptics } from "@/lib/haptics";

// Terminal failures: the device has no biometrics and no passcode, so the
// prompt can never succeed. Distinct from user_cancel or lockout, where a
// retry can work. On these we surface an error instead of silently no-oping
// (Apple 5.1.1(v)).
const AUTH_UNAVAILABLE_ERRORS = new Set<LocalAuthenticationError>([
  "not_available",
  "not_enrolled",
  "passcode_not_set",
]);

export function isAuthUnavailable(error: LocalAuthenticationError): boolean {
  return AUTH_UNAVAILABLE_ERRORS.has(error);
}

// Face ID gate, soft-delete mutation, and sign-out for account deletion, shared
// by the profile and settings screens. The mutation can reject (rate limit,
// network, server); on failure the caller surfaces `deleteError` instead of
// leaving the user on an unchanged screen after confirming a destructive action.
export function useDeleteAccount() {
  const deleteAccountMutation = useMutation(api.users.deleteAccount);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteAccount = useCallback(async () => {
    setDeleteError(null);
    haptics.error();
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Confirm with Face ID",
    });
    if (!result.success) {
      if (isAuthUnavailable(result.error)) setDeleteError("Device authentication unavailable");
      return;
    }
    try {
      await deleteAccountMutation();
      await authClient.signOut();
    } catch (err) {
      haptics.error();
      setDeleteError(formatError(err));
    }
  }, [deleteAccountMutation]);

  return { deleteAccount, deleteError };
}
