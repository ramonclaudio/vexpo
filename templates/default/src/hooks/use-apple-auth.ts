import { useActionState, useEffect, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";

import { authClient } from "@/lib/auth-client";
import { haptics } from "@/lib/haptics";
import { announce } from "@/lib/a11y";

type AppleState = { error?: string };
const initialState: AppleState = {};

const APPLE_ERRORS: Record<string, string> = {
  ERR_REQUEST_UNKNOWN: "Apple couldn't complete the sign-in. Please try again.",
  ERR_REQUEST_FAILED: "Apple couldn't complete the sign-in. Please try again.",
  ERR_INVALID_RESPONSE: "Apple sent a response we couldn't read. Please try again.",
  ERR_REQUEST_NOT_HANDLED: "Apple couldn't show the sign-in sheet. Please try again.",
  ERR_REQUEST_NOT_INTERACTIVE: "Apple couldn't show the sign-in sheet. Please try again.",
};

export function appleErrorMessage(e: unknown): string {
  const code = e instanceof Error && "code" in e ? String(e.code) : "";
  if (__DEV__) console.warn("[AppleAuth]", code, e instanceof Error ? e.message : e);
  return (
    APPLE_ERRORS[code] ?? "Apple sign-in didn't go through. Please try again, or use your email."
  );
}

export function useAppleAuth({ successMessage }: { successMessage: string }) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAvailable);
  }, []);

  const [state, signIn, isPending] = useActionState<AppleState, void>(async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        haptics.error();
        return { error: "Apple didn't return an identity token. Please try again." };
      }

      const { givenName, familyName } = credential.fullName ?? {};
      const response = await authClient.signIn.social({
        provider: "apple",
        idToken: {
          token: credential.identityToken,
          ...(givenName || familyName
            ? { user: { name: { firstName: givenName ?? "", lastName: familyName ?? "" } } }
            : {}),
        },
      });

      if (response.error) {
        haptics.error();
        if (__DEV__) console.warn("[AppleAuth] server", response.error.status, response.error.code);
        return {
          error:
            response.error.status === 429
              ? "Too many sign-in attempts. Please wait a minute and try again."
              : "We couldn't finish signing you in with Apple. Please try again, or use your email.",
        };
      }
      haptics.success();
      announce(successMessage);
      return {};
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ERR_REQUEST_CANCELED") return {};
      haptics.error();
      return { error: appleErrorMessage(e) };
    }
  }, initialState);

  return { available, signIn, isPending, error: state.error };
}
