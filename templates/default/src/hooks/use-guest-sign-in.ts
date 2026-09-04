import { useActionState, useEffect, useRef } from "react";
import { router } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { announce } from "@/lib/a11y";
import { haptics } from "@/lib/haptics";
import { useAuthStatus } from "@/hooks/use-auth-status";

type GuestState = { error?: string };
const initialState: GuestState = {};

export function guestSignInError(status?: number): string {
  return status === 429
    ? "Too many tries. Wait a minute and tap it again."
    : "Couldn't start a guest session. Check your connection and try again.";
}

export function useGuestSignIn() {
  const { isGuest } = useAuthStatus();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current && isGuest) {
      startedRef.current = false;
      router.replace("/");
    }
  }, [isGuest]);

  const [state, signIn, isPending] = useActionState<GuestState, void>(async () => {
    try {
      const response = await authClient.signIn.anonymous();
      if (response.error) {
        haptics.error();
        return { error: guestSignInError(response.error.status) };
      }
      startedRef.current = true;
      haptics.success();
      announce("Browsing as a guest");
      return {};
    } catch {
      haptics.error();
      return { error: guestSignInError() };
    }
  }, initialState);

  return { signIn, isPending, error: state.error };
}

export function dismissAuth() {
  haptics.selection();
  if (router.canGoBack()) router.back();
  else router.replace("/");
}
