import { startTransition, useActionState, useEffect, useState } from "react";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { Host, ScrollView, VStack, Button, Text, useNativeState } from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
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
import { TouchTarget } from "@/constants/layout";
import { PasswordField } from "@/components/auth/password-field";
import { CapsuleTextField } from "@/components/ui/capsule-text-field";
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog";
import { HelperText } from "@/components/ui/helper-text";
import { ProminentButton } from "@/components/ui/capsule-button";
import { ErrorText } from "@/components/ui/status-text";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { LabeledField } from "@/components/ui/labeled-field";
import { useColors } from "@/hooks/use-theme";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useDynamicFont } from "@/lib/dynamic-font";
import { fail, succeed } from "@/lib/form-result";

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
  const emailState = useNativeState(email);

  const [state, submit, isPending] = useActionState<ChangePasswordState, void>(async (prev) => {
    const attempt = (prev.attempt ?? 0) + 1;
    if (!current || !next || !confirm) {
      return fail("Fill in every field", attempt);
    }
    if (next.length < 10 || next.length > 128) {
      return fail("Password must be 10-128 characters", attempt);
    }
    if (next !== confirm) {
      return fail("Passwords do not match", attempt);
    }
    try {
      const res = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (res.error) {
        return fail(res.error.message ?? "Failed to change password", attempt);
      }
      succeed("Password changed. Other sessions have been signed out.");
      return { ok: true };
    } catch {
      return fail("An unexpected error occurred", attempt);
    }
  }, initialState);

  const hasInput = current.length > 0 || next.length > 0 || confirm.length > 0;
  const { pendingNavAction, discard, dismiss } = useUnsavedChanges(hasInput && !state.ok);

  useEffect(() => {
    if (state.ok) router.back();
  }, [state.ok]);

  return (
    <Host testID="change-password-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        modifiers={[
          scrollDismissesKeyboard("interactively"),
          tint(colors.primary),
          defaultScrollAnchorForRole("center", "sizeChanges"),
        ]}
      >
        <VStack
          spacing={20}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
        >
          <VStack spacing={6} alignment="leading">
            <Text
              testID="change-password-title"
              modifiers={[
                dfont({ size: 28, weight: "bold" }),
                accessibilityAddTraits(["isHeader"]),
              ]}
            >
              Change password
            </Text>
            <Text modifiers={[dfont({ size: 14 }), foregroundStyle(colors.mutedForeground)]}>
              Other devices will be signed out.
            </Text>
          </VStack>

          <LabeledField label="Account">
            <CapsuleTextField
              testID="change-password-account"
              text={emailState}
              modifiers={[
                foregroundStyle(colors.mutedForeground),
                textContentType("username"),
                disabled(true),
                accessibilityLabel("Account email"),
              ]}
            />
          </LabeledField>

          <LabeledField label="Current password">
            <PasswordField
              testID="change-password-current"
              onTextChange={setCurrent}
              disabled={isPending}
              submitLabelType="next"
              accessibilityLabel="Current password"
              accessibilityHint="Enter your existing password"
            />
          </LabeledField>

          <LabeledField label="New password">
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
          </LabeledField>

          <LabeledField label="Confirm new password">
            <PasswordField
              testID="change-password-confirm"
              onTextChange={setConfirm}
              onSubmit={() => startTransition(() => submit())}
              contentType="newPassword"
              disabled={isPending}
              accessibilityLabel="Confirm new password"
              accessibilityHint="Re-enter the new password to confirm"
            />
          </LabeledField>

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
                foregroundStyle(colors.mutedForeground),
                dfont({ size: 14, weight: "semibold" }),
                frame({ minHeight: TouchTarget.min }),
                disabled(isPending),
              ]}
              onPress={() => {
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
