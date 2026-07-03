import { startTransition, useActionState, useEffect, useState } from "react";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { Host, ScrollView, VStack, Button, Text, useNativeState } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  buttonStyle,
  defaultScrollAnchorForRole,
  disabled,
  foregroundStyle,
  frame,
  padding,
  scrollDismissesKeyboard,
  textContentType,
  tint,
} from "@expo/ui/swift-ui/modifiers";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { announce } from "@/lib/a11y";
import { haptics } from "@/lib/haptics";
import { TouchTarget } from "@/constants/layout";
import { PasswordField } from "@/components/auth/password-field";
import { CapsuleTextField } from "@/components/ui/capsule-text-field";
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog";
import { HelperText } from "@/components/ui/helper-text";
import { ProminentButton } from "@/components/ui/prominent-button";
import { ErrorText } from "@/components/ui/status-text";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { useColors } from "@/hooks/use-theme";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useDynamicFont } from "@/lib/dynamic-font";

type ChangePasswordState = { error?: string; ok?: boolean; attempt?: number };
const initialState: ChangePasswordState = {};

export default function ChangePasswordScreen() {
  const me = useQuery(api.users.getMe);
  if (!me) return <LoadingScreen testID="change-password-loading" />;
  return <ChangePasswordForm email={me.email} />;
}

function ChangePasswordForm({ email }: { email: string }) {
  const dfont = useDynamicFont();
  const colors = useColors();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  // Hidden username carrier. iOS keychain pairs `username` + `newPassword` to
  // save the credential and to associate Strong Password suggestions with this
  // account. Without it the suggestion sheet may not fire and a saved password
  // would land orphaned in iCloud Keychain.
  const emailState = useNativeState(email);

  const [state, submit, isPending] = useActionState<ChangePasswordState, void>(async (prev) => {
    haptics.light();
    const attempt = (prev.attempt ?? 0) + 1;
    if (!current || !next || !confirm) {
      haptics.error();
      return { error: "Fill in every field", attempt };
    }
    if (next.length < 10 || next.length > 128) {
      haptics.error();
      return { error: "Password must be 10-128 characters", attempt };
    }
    if (next !== confirm) {
      haptics.error();
      return { error: "Passwords do not match", attempt };
    }
    try {
      const res = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (res.error) {
        haptics.error();
        return { error: res.error.message ?? "Failed to change password", attempt };
      }
      haptics.success();
      announce("Password changed. Other sessions have been signed out.");
      return { ok: true };
    } catch {
      haptics.error();
      return { error: "An unexpected error occurred", attempt };
    }
  }, initialState);

  const hasInput = current.length > 0 || next.length > 0 || confirm.length > 0;
  const { pendingNavAction, discard, dismiss } = useUnsavedChanges(hasInput && !state.ok);

  useEffect(() => {
    if (state.ok) router.back();
  }, [state.ok]);

  const labelModifiers = [dfont({ size: 17, weight: "semibold" })];

  return (
    <Host testID="change-password-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        modifiers={[
          scrollDismissesKeyboard("interactively"),
          tint(colors.primary as string),
          // A wrong-current-password error appears below the confirm field and
          // pushes the Update button down. Pin the visible center so the user
          // does not lose the field they just submitted. No-op below iOS 18.
          defaultScrollAnchorForRole("center", "sizeChanges"),
        ]}
      >
        <VStack
          spacing={20}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          <VStack spacing={6} alignment="leading">
            <Text testID="change-password-title" modifiers={[dfont({ size: 28, weight: "bold" })]}>
              Change password
            </Text>
            <Text
              modifiers={[dfont({ size: 14 }), foregroundStyle(colors.mutedForeground as string)]}
            >
              Other devices will be signed out.
            </Text>
          </VStack>

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>Account</Text>
            <CapsuleTextField
              testID="change-password-account"
              text={emailState}
              modifiers={[
                foregroundStyle(colors.mutedForeground as string),
                textContentType("username"),
                disabled(true),
                accessibilityLabel("Account email"),
              ]}
            />
          </VStack>

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>Current password</Text>
            <PasswordField
              testID="change-password-current"
              onTextChange={setCurrent}
              disabled={isPending}
              submitLabelType="next"
              accessibilityLabel="Current password"
              accessibilityHint="Enter your existing password"
            />
          </VStack>

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>New password</Text>
            <PasswordField
              testID="change-password-new"
              onTextChange={setNext}
              contentType="newPassword"
              disabled={isPending}
              submitLabelType="next"
              accessibilityLabel="New password"
              accessibilityHint="Choose a new password with at least 10 characters"
            />
            <HelperText>At least 10 characters.</HelperText>
          </VStack>

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>Confirm new password</Text>
            <PasswordField
              testID="change-password-confirm"
              onTextChange={setConfirm}
              onSubmit={() => startTransition(() => submit())}
              contentType="newPassword"
              disabled={isPending}
              accessibilityLabel="Confirm new password"
              accessibilityHint="Re-enter the new password to confirm"
            />
          </VStack>

          {state.error ? (
            <ErrorText testID="change-password-error" attempt={state.attempt}>
              {state.error}
            </ErrorText>
          ) : null}

          <ProminentButton
            testID="change-password-submit"
            label={isPending ? "Updating..." : "Update password"}
            onPress={() => startTransition(() => submit())}
            disabled={isPending}
          />

          <VStack alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
            <Button
              testID="change-password-cancel"
              label="Cancel"
              modifiers={[
                buttonStyle("plain"),
                foregroundStyle(colors.mutedForeground as string),
                dfont({ size: 14, weight: "semibold" }),
                frame({ minHeight: TouchTarget.min }),
                disabled(isPending),
              ]}
              onPress={() => {
                haptics.light();
                router.back();
              }}
            />
          </VStack>
        </VStack>
      </ScrollView>

      <DiscardChangesDialog
        testIDPrefix="change-password"
        message="Your password entries will be lost."
        pendingNavAction={pendingNavAction}
        onDiscard={discard}
        onDismiss={dismiss}
      />
    </Host>
  );
}
