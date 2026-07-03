import { useActionState, useEffect, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";

import { authClient } from "@/lib/auth-client";
import { haptics } from "@/lib/haptics";
import { announce } from "@/lib/a11y";

type AppleState = { error?: string };
const initialState: AppleState = {};

// Sign in with Apple, shared by the sign-in and sign-up screens. Owns the
// `isAvailableAsync` probe (Apple only shows the button on capable devices) and
// the credential -> `signIn.social` action. `successMessage` is the only thing
// the two screens differ on. A user tapping "cancel" throws ERR_REQUEST_CANCELED
// which we swallow to a no-op, not an error.
export function useAppleAuth({ successMessage }: { successMessage: string }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAvailable);
  }, []);

  const [state, signIn, isPending] = useActionState<AppleState, void>(async () => {
    haptics.light();
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        haptics.error();
        return { error: "Apple did not return an identity token" };
      }

      const response = await authClient.signIn.social({
        provider: "apple",
        idToken: { token: credential.identityToken },
      });

      if (response.error) {
        haptics.error();
        return { error: response.error.message ?? "Apple sign-in failed" };
      }
      haptics.success();
      announce(successMessage);
      return {};
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ERR_REQUEST_CANCELED") return {};
      haptics.error();
      return { error: e instanceof Error ? e.message : "Apple sign-in failed" };
    }
  }, initialState);

  return { available, signIn, isPending, error: state.error };
}
