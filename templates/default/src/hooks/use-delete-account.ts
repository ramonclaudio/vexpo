import { useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import type { LocalAuthenticationError } from "expo-local-authentication";

import { api } from "@/convex/_generated/api";
import { useSignOutMutation } from "@/hooks/use-sign-out-mutation";

const AUTH_UNAVAILABLE_ERRORS = new Set<LocalAuthenticationError>([
  "not_available",
  "not_enrolled",
  "passcode_not_set",
]);

export function isAuthUnavailable(error: LocalAuthenticationError): boolean {
  return AUTH_UNAVAILABLE_ERRORS.has(error);
}

export function useDeleteAccount() {
  const faceId = useCallback(async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Confirm with Face ID",
    });
    if (result.success) return { ok: true } as const;
    return {
      ok: false,
      error: isAuthUnavailable(result.error) ? "Device authentication unavailable" : undefined,
    } as const;
  }, []);

  const [deleteAccount, deleteError] = useSignOutMutation(api.users.deleteAccount, faceId);
  return { deleteAccount, deleteError };
}
