/**
 * Restore-or-confirm surface for the account-deletion window.
 *
 * Reachable only when `getMe` returns a user with `deletedAt` set. The
 * (app) layout's `useAccountDeletionGuard` hook redirects here on entry
 * and keeps the user from navigating elsewhere until they pick a path:
 *
 *   Restore Account       calls `users.restoreAccount`, clears the
 *                         tombstone, drops us back at the home tab
 *   Sign Out              hard sign-out; the 30-day cron continues to
 *                         tick down toward permanent deletion
 *
 * Apple revoke does NOT happen here; the soft-delete pattern in
 * `users.deleteAccount` defers Apple's `revokeRefreshToken` to the
 * `hardDeleteExpired` cron so a restore within the window leaves SIWA
 * authorization intact.
 */

import { router } from "expo-router";
import { useActionState, useState } from "react";
import { Image as ExpoImage } from "expo-image";
import { Button, Host, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  buttonStyle,
  clipShape,
  foregroundStyle,
  frame,
  multilineTextAlignment,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { useMutation, useQuery } from "convex/react";

import { ProminentButton } from "@/components/ui/prominent-button";
import { ErrorText } from "@/components/ui/status-text";
import { api } from "@/convex/_generated/api";
import { Button as ButtonTokens } from "@/constants/layout";
import { useColors, useThemedAsset } from "@/hooks/use-theme";
import { announce } from "@/lib/a11y";
import { assets } from "@/lib/assets";
import { authClient } from "@/lib/auth-client";
import { useDynamicFont } from "@/lib/dynamic-font";
import { haptics } from "@/lib/haptics";

// Mirror of `ACCOUNT_DELETION_GRACE_MS` in `convex/users.ts`. Importing
// across the convex / app boundary costs a runtime require for a single
// constant, so inline it here. If you ever change the grace window,
// keep the two in sync.
const ACCOUNT_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

type ActionState = { error?: string };
const initialState: ActionState = {};

export default function RestoreAccountScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const brandIcon = useThemedAsset(assets.brandIconLight, assets.brandIconDark);
  const me = useQuery(api.users.getMe);
  const restoreMutation = useMutation(api.users.restoreAccount);

  const [signingOut, setSigningOut] = useState(false);

  const [restoreState, restore, restorePending] = useActionState<ActionState, void>(async () => {
    haptics.medium();
    try {
      await restoreMutation();
      haptics.success();
      announce("Account restored");
      router.replace("/");
      return {};
    } catch (err) {
      haptics.error();
      return { error: err instanceof Error ? err.message : "Failed to restore account" };
    }
  }, initialState);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    haptics.medium();
    try {
      await authClient.signOut();
    } finally {
      setSigningOut(false);
    }
  };

  if (!me) {
    return (
      <Host style={{ flex: 1, backgroundColor: colors.background }}>
        <Spacer />
      </Host>
    );
  }

  // Note: `deletedAt` cleared mid-mount is handled by
  // `useAccountDeletionGuard` in (app)/_layout.tsx, which routes the user
  // back to `/` on the next render. No side-effect-in-render needed here.
  if (!me.deletedAt) {
    return (
      <Host style={{ flex: 1, backgroundColor: colors.background }}>
        <Spacer />
      </Host>
    );
  }

  const permanentDeleteAt = new Date(me.deletedAt + ACCOUNT_DELETION_GRACE_MS);
  const formattedDate = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(permanentDeleteAt);

  return (
    <Host style={{ flex: 1, backgroundColor: colors.background }}>
      <VStack
        spacing={24}
        alignment="center"
        modifiers={[
          frame({ maxWidth: 10000, maxHeight: 10000 }),
          padding({ horizontal: 24, vertical: 48 }),
        ]}
      >
        <ExpoImage source={brandIcon} style={{ width: 72, height: 72 }} contentFit="contain" />

        <VStack spacing={12} alignment="center">
          <Text
            modifiers={[
              dfont({ size: 24, weight: "bold" }),
              foregroundStyle(colors.foreground as string),
              multilineTextAlignment("center"),
            ]}
          >
            Account Scheduled for Deletion
          </Text>
          <Text
            modifiers={[
              dfont({ size: 15 }),
              foregroundStyle(colors.mutedForeground as string),
              multilineTextAlignment("center"),
            ]}
          >
            {`Your account is set to be permanently deleted on ${formattedDate}. Restore now to keep your account and all of its data.`}
          </Text>
        </VStack>

        <VStack spacing={12} alignment="center" modifiers={[frame({ maxWidth: 10000 })]}>
          <ProminentButton
            label={restorePending ? "Restoring…" : "Restore Account"}
            onPress={() => restore()}
            disabled={restorePending || signingOut}
          />
          <Button
            modifiers={[
              buttonStyle("plain"),
              frame({ maxWidth: 10000, height: ButtonTokens.height }),
              background(colors.muted as string),
              clipShape("capsule"),
            ]}
            onPress={handleSignOut}
          >
            <Text
              modifiers={[
                dfont({ size: 16, weight: "medium" }),
                foregroundStyle(colors.destructive as string),
              ]}
            >
              {signingOut ? "Signing Out…" : "Sign Out"}
            </Text>
          </Button>
        </VStack>

        {restoreState.error ? <ErrorText>{restoreState.error}</ErrorText> : null}
      </VStack>
    </Host>
  );
}
