import { startTransition, useActionState, useEffect, useState } from "react";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { Host, ScrollView, VStack, Text, useNativeState } from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
  accessibilityLabel,
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
import { PasswordField } from "@/components/auth/password-field";
import { CapsuleTextField } from "@/components/ui/capsule-text-field";
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog";
import { HelperText } from "@/components/ui/helper-text";
import { PlainButton, ProminentButton } from "@/components/ui/capsule-button";
import { ErrorText } from "@/components/ui/status-text";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { LabeledField } from "@/components/ui/labeled-field";
import { Colors } from "@/constants/theme";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useDynamicFont } from "@/lib/dynamic-font";
import { UNEXPECTED_ERROR, fail, succeed } from "@/lib/form-result";
import { changePasswordSchema, firstError } from "@/lib/schemas";

type ChangePasswordState = { error?: string; ok?: boolean };
const initialState: ChangePasswordState = {};

export default function ChangePasswordScreen() {
  const me = useQuery(api.users.getMe);
  if (!me) return <LoadingScreen />;
  return <ChangePasswordForm email={me.email} />;
}

function ChangePasswordForm({ email }: { email: string }) {
  const dfont = useDynamicFont();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const emailState = useNativeState(email);

  const [state, submit, isPending] = useActionState<ChangePasswordState, void>(async () => {
    const parsed = changePasswordSchema.safeParse({
      current,
      password: next,
      confirmPassword: confirm,
    });
    if (!parsed.success) return fail(firstError(parsed)!);
    try {
      const res = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (res.error) {
        return fail(res.error.message ?? "Failed to change password");
      }
      succeed("Password changed. Other sessions have been signed out.");
      return { ok: true };
    } catch {
      return fail(UNEXPECTED_ERROR);
    }
  }, initialState);

  const hasInput = current.length > 0 || next.length > 0 || confirm.length > 0;
  const { pendingNavAction, discard, dismiss } = useUnsavedChanges(hasInput && !state.ok);

  useEffect(() => {
    if (state.ok) router.back();
  }, [state.ok]);

  return (
    <Host style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        modifiers={[
          scrollDismissesKeyboard("interactively"),
          tint(Colors.primary),
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
              modifiers={[
                dfont({ size: 28, weight: "bold" }),
                accessibilityAddTraits(["isHeader"]),
              ]}
            >
              Change password
            </Text>
            <Text modifiers={[dfont({ size: 14 }), foregroundStyle(Colors.mutedForeground)]}>
              Other devices will be signed out.
            </Text>
          </VStack>

          <LabeledField label="Account">
            <CapsuleTextField
              text={emailState}
              modifiers={[
                foregroundStyle(Colors.mutedForeground),
                textContentType("username"),
                disabled(true),
                accessibilityLabel("Account email"),
              ]}
            />
          </LabeledField>

          <LabeledField label="Current password">
            <PasswordField
              onTextChange={setCurrent}
              disabled={isPending}
              submitLabelType="next"
              accessibilityLabel="Current password"
              accessibilityHint="Enter your current password"
            />
          </LabeledField>

          <LabeledField label="New password">
            <PasswordField
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
              onTextChange={setConfirm}
              onSubmit={() => startTransition(() => submit())}
              contentType="newPassword"
              disabled={isPending}
              accessibilityLabel="Confirm new password"
              accessibilityHint="Re-enter the new password to confirm"
            />
          </LabeledField>

          {state.error ? <ErrorText>{state.error}</ErrorText> : null}

          <ProminentButton
            label={isPending ? "Updating..." : "Update password"}
            onPress={() => startTransition(() => submit())}
            disabled={isPending}
          />

          <VStack alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
            <PlainButton label="Cancel" onPress={() => router.back()} disabled={isPending} />
          </VStack>
        </VStack>
      </ScrollView>

      <DiscardChangesDialog
        message="Your password entries will be lost."
        pendingNavAction={pendingNavAction}
        onDiscard={discard}
        onDismiss={dismiss}
      />
    </Host>
  );
}
