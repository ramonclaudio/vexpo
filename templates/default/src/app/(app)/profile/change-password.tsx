import { startTransition, useActionState, useEffect, useState } from "react";
import { router, useNavigation } from "expo-router";
import { useQuery } from "convex/react";
import {
  Host,
  ScrollView,
  VStack,
  TextField,
  Button,
  Text,
  Spacer,
  ConfirmationDialog,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  background,
  buttonStyle,
  clipShape,
  defaultScrollAnchorForRole,
  disabled,
  foregroundStyle,
  frame,
  padding,
  scrollDismissesKeyboard,
  textContentType,
  textFieldStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { announce } from "@/lib/a11y";
import { haptics } from "@/lib/haptics";
import { Button as ButtonTokens } from "@/constants/layout";
import { PasswordField } from "@/components/auth/password-field";
import { ProminentButton } from "@/components/ui/prominent-button";
import { ErrorText } from "@/components/ui/status-text";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { useColors } from "@/hooks/use-theme";
import { useDynamicFont } from "@/lib/dynamic-font";

type ChangePasswordState = { error?: string; ok?: boolean };
const initialState: ChangePasswordState = {};

export default function ChangePasswordScreen() {
  const me = useQuery(api.users.getMe);
  if (!me) return <LoadingScreen />;
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

  const [state, submit, isPending] = useActionState<ChangePasswordState, void>(async () => {
    haptics.light();
    if (!current || !next || !confirm) {
      haptics.error();
      return { error: "Fill in every field" };
    }
    if (next.length < 10 || next.length > 128) {
      haptics.error();
      return { error: "Password must be 10-128 characters" };
    }
    if (next !== confirm) {
      haptics.error();
      return { error: "Passwords do not match" };
    }
    try {
      const res = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (res.error) {
        haptics.error();
        return { error: res.error.message ?? "Failed to change password" };
      }
      haptics.success();
      announce("Password changed. Other sessions have been signed out.");
      return { ok: true };
    } catch {
      haptics.error();
      return { error: "An unexpected error occurred" };
    }
  }, initialState);

  const navigation = useNavigation();
  const hasInput = current.length > 0 || next.length > 0 || confirm.length > 0;
  const [pendingNavAction, setPendingNavAction] = useState<
    Parameters<typeof navigation.dispatch>[0] | null
  >(null);
  useEffect(() => {
    if (!hasInput || state.ok) return;
    return navigation.addListener("beforeRemove", (e) => {
      e.preventDefault();
      setPendingNavAction(e.data.action);
    });
  }, [navigation, hasInput, state.ok]);

  useEffect(() => {
    if (state.ok) router.back();
  }, [state.ok]);

  const labelModifiers = [dfont({ size: 17, weight: "semibold" })];
  const helperModifiers = [dfont({ size: 13 }), foregroundStyle(colors.mutedForeground as string)];

  return (
    <Host style={{ flex: 1, backgroundColor: colors.background }}>
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
            <Text modifiers={[dfont({ size: 28, weight: "bold" })]}>Change password</Text>
            <Text
              modifiers={[dfont({ size: 14 }), foregroundStyle(colors.mutedForeground as string)]}
            >
              Other devices will be signed out.
            </Text>
          </VStack>

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>Account</Text>
            <TextField
              text={emailState}
              modifiers={[
                textFieldStyle("plain"),
                padding({ horizontal: 16 }),
                frame({ maxWidth: Infinity, height: ButtonTokens.height }),
                background(colors.muted as string),
                clipShape("capsule"),
                dfont({ size: 16 }),
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
              onTextChange={setNext}
              contentType="newPassword"
              disabled={isPending}
              submitLabelType="next"
              accessibilityLabel="New password"
              accessibilityHint="Choose a new password with at least 10 characters"
            />
            <Text modifiers={helperModifiers}>At least 10 characters.</Text>
          </VStack>

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>Confirm new password</Text>
            <PasswordField
              onTextChange={setConfirm}
              onSubmit={() => startTransition(() => submit())}
              contentType="newPassword"
              disabled={isPending}
              accessibilityLabel="Confirm new password"
              accessibilityHint="Re-enter the new password to confirm"
            />
          </VStack>

          {state.error ? <ErrorText>{state.error}</ErrorText> : null}

          <ProminentButton
            label={isPending ? "Updating..." : "Update password"}
            onPress={() => startTransition(() => submit())}
            disabled={isPending}
          />

          <VStack alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
            <Button
              label="Cancel"
              modifiers={[
                buttonStyle("plain"),
                foregroundStyle(colors.mutedForeground as string),
                dfont({ size: 14, weight: "semibold" }),
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

      <ConfirmationDialog
        title="Discard changes?"
        isPresented={pendingNavAction !== null}
        onIsPresentedChange={(v) => {
          if (!v) setPendingNavAction(null);
        }}
        titleVisibility="visible"
      >
        <ConfirmationDialog.Trigger>
          <Spacer modifiers={[frame({ width: 0, height: 0 })]} />
        </ConfirmationDialog.Trigger>
        <ConfirmationDialog.Actions>
          <Button
            label="Discard"
            role="destructive"
            onPress={() => {
              haptics.warning();
              const action = pendingNavAction;
              setPendingNavAction(null);
              if (action) navigation.dispatch(action);
            }}
          />
          <Button label="Keep Editing" role="cancel" />
        </ConfirmationDialog.Actions>
        <ConfirmationDialog.Message>
          <Text modifiers={[dfont({ size: 16 })]}>Your password entries will be lost.</Text>
        </ConfirmationDialog.Message>
      </ConfirmationDialog>
    </Host>
  );
}
