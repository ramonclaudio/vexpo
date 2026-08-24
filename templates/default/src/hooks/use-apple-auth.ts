import { useActionState, useEffect, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";

import { authClient } from "@/lib/auth-client";
import { haptics } from "@/lib/haptics";
import { announce } from "@/lib/a11y";

type AppleState = { error?: string };
const initialState: AppleState = {};

// expo-apple-authentication rejects with an ExpoModulesCore exception whose
// `message` is the Swift `reason` plus the throwing file and line, e.g.
// "RequestUnknownException: The authorization attempt failed for an unknown
// reason (at ExpoAppleAuthentication/AppleAuthenticationExceptions.swift:61)".
// Showing that to a user is a bug, so map the codes we can act on and fall
// back to plain copy. Codes come from the class name: ExpoModulesCore strips
// the `Exception` suffix, snake-cases and uppercases it, then prefixes `ERR_`.
const APPLE_ERRORS: Record<string, string> = {
  // ASAuthorizationError.unknown covers a simulator with no Apple Account and
  // an entitlement or App ID mismatch alike, so there is nothing specific to
  // tell the user. The code and the raw reason go to the dev warn instead.
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
        return { error: "Apple didn't return an identity token. Please try again." };
      }

      // Apple returns `fullName` on the first authorization only, so forward it
      // now or the account keeps an empty name forever. The identity token
      // carries no name claim.
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

      // A rejected identity token lands here, not in the catch, and Better
      // Auth's message for it is the bare string "Invalid token". Nothing on
      // this branch is worth showing except a rate limit, which is the only
      // one the user can act on.
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
