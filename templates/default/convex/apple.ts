import { v } from "convex/values";

import { internalAction } from "./_generated/server";

const REVOKE_URL = "https://appleid.apple.com/auth/revoke";

// Revokes a Sign in with Apple refresh token via Apple's REST API. Scheduled
// from `users.deleteAccount` so app authorization is removed from Apple's
// side, per Apple's account-deletion requirement:
//
//   "If people used Sign in with Apple to create an account within your app,
//   you revoke the associated tokens when they delete their account."
//   developer.apple.com/documentation/SigninwithAppleRESTAPI/Revoke-tokens
//
// `APPLE_CLIENT_ID` is the SIWA Services ID and `APPLE_CLIENT_SECRET` is the
// ES256 JWT that the `rotate-apple-jwt` EAS workflow refreshes every 90 days
// (180-day Apple cap). Best-effort: a failed revoke logs and returns rather
// than throwing, because the user has already confirmed account deletion and
// the local rows are about to be wiped anyway.
export const revokeRefreshToken = internalAction({
  args: { refreshToken: v.string() },
  returns: v.null(),
  handler: async (_ctx, { refreshToken }) => {
    const clientId = process.env.APPLE_CLIENT_ID;
    const clientSecret = process.env.APPLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.warn("[apple] revoke skipped: APPLE_CLIENT_ID or APPLE_CLIENT_SECRET unset");
      return null;
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token: refreshToken,
      token_type_hint: "refresh_token",
    });

    try {
      const res = await fetch(REVOKE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!res.ok) {
        const text = await res.text();
        console.warn(`[apple] revoke failed ${res.status}: ${text}`);
      }
    } catch (err) {
      console.warn(`[apple] revoke threw: ${err instanceof Error ? err.message : String(err)}`);
    }
    return null;
  },
});
