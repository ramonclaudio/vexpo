import { useActionState, useEffect, useRef } from "react";
import { router } from "expo-router";

import { authClient } from "@/lib/auth-client";
import { announce } from "@/lib/a11y";
import { haptics } from "@/lib/haptics";
import { useAuthStatus } from "@/hooks/use-auth-status";

type GuestState = { error?: string };
const initialState: GuestState = {};

/**
 * Copy for a guest sign-in that did not go through. The only branch worth
 * telling apart is the rate limit, because waiting is something the user can
 * act on; everything else (offline, a dropped request, a 5xx) reads the same
 * from the button and gets one plain line. Exported so the mapping is testable
 * without a renderer, the same way `appleErrorMessage` is.
 */
export function guestSignInError(status?: number): string {
  return status === 429
    ? "Too many tries. Wait a minute and tap it again."
    : "Couldn't start a guest session. Check your connection and try again.";
}

/**
 * "Continue as guest" on the sign-in and sign-up screens.
 *
 * Signing in normally un-registers the whole `auth` group, and expo-router
 * moves off a screen that no longer exists. A guest session leaves `auth`
 * registered (that is how they get back here to upgrade), so nothing moves on
 * its own and this navigates once the session has actually landed in the
 * store. Doing it inline after the await races the store update.
 */
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

/** Back out of the auth screens to the app. Only reachable with a session. */
export function dismissAuth() {
  haptics.selection();
  if (router.canGoBack()) router.back();
  else router.replace("/");
}
