import { startTransition, useActionState, useEffect, useState } from "react";
import { Image as ExpoImage } from "expo-image";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import {
  Host,
  ScrollView,
  VStack,
  TextField,
  Button,
  Text,
  Image,
  Spacer,
  RNHostView,
  ConfirmationDialog,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  foregroundStyle,
  buttonStyle,
  background,
  clipShape,
  disabled,
  keyboardType,
  textFieldStyle,
  padding,
  frame,
  scrollDismissesKeyboard,
  multilineTextAlignment,
  monospacedDigit,
  kerning,
  submitLabel,
  textContentType,
  accessibilityLabel,
  accessibilityHint,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";

import { authClient } from "@/lib/auth-client";
import { assets } from "@/lib/assets";
import { haptics } from "@/lib/haptics";
import { firstError, resetPasswordSchema } from "@/lib/schemas";
import { PasswordField } from "@/components/auth/password-field";
import { ProminentButton } from "@/components/ui/prominent-button";
import { ErrorText } from "@/components/ui/status-text";
import { announce } from "@/lib/a11y";
import { useColors, useThemedAsset } from "@/hooks/use-theme";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

type ResetState = { error?: string; ok?: boolean };
const initialState: ResetState = {};

export default function ResetPasswordScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const brandIcon = useThemedAsset(assets.brandIconLight, assets.brandIconDark);
  const { email = "" } = useLocalSearchParams<{ email: string }>();
  const providers = useQuery(api.auth.getEnabledProviders);
  // Reset requires the email-OTP flow which requires Resend. Redirect away
  // in lite mode (`REQUIRE_EMAIL_VERIFICATION` unset).
  useEffect(() => {
    if (providers !== undefined && providers.emailFeatures === false) {
      router.replace("/sign-in");
    }
  }, [providers]);

  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Hidden carrier so iOS keychain pairs the new password with this email
  // when Strong Password offers a suggestion and the user accepts.
  const emailIdentityState = useNativeState(email);

  const [state, submit, isPending] = useActionState<ResetState, void>(async () => {
    haptics.light();

    if (!email) {
      haptics.error();
      return { error: "Missing email. Start over from forgot password." };
    }

    const parsed = resetPasswordSchema.safeParse({ email, otp, password, confirmPassword });
    if (!parsed.success) {
      haptics.error();
      return { error: firstError(parsed)! };
    }

    try {
      const response = await authClient.emailOtp.resetPassword({
        email: parsed.data.email,
        otp: parsed.data.otp,
        password: parsed.data.password,
      });

      if (response.error) {
        haptics.error();
        const message = response.error.message ?? "Failed to reset password";
        const lower = message.toLowerCase();
        if (lower.includes("expired") || lower.includes("invalid")) {
          return { error: "This code has expired. Request a new one." };
        }
        return { error: message };
      }
      haptics.success();
      announce("Password reset");
      return { ok: true };
    } catch {
      haptics.error();
      return { error: "An unexpected error occurred. Please try again." };
    }
  }, initialState);

  const navigation = useNavigation();
  const hasInput = otp.length > 0 || password.length > 0 || confirmPassword.length > 0;
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

  const error = state.error;
  const isExpiredError = error && (error.includes("expired") || error.includes("Missing email"));
  const inputModifiers = [
    textFieldStyle("plain"),
    padding({ horizontal: 16 }),
    frame({ maxWidth: Infinity, height: ButtonTokens.height }),
    background(colors.muted as string),
    clipShape("capsule"),
    dfont({ size: 16 }),
  ];

  if (state.ok) {
    return (
      <Host style={{ flex: 1, backgroundColor: colors.background }}>
        <VStack
          spacing={16}
          alignment="center"
          modifiers={[padding({ horizontal: 24 }), tint(colors.primary as string)]}
        >
          <Spacer />
          <Image
            systemName="checkmark.circle.fill"
            size={56}
            color={colors.success}
            modifiers={[accessibilityLabel("")]}
          />
          <Text modifiers={[dfont({ size: 28, weight: "bold" })]}>Password reset!</Text>
          <Text
            modifiers={[
              dfont({ size: 15 }),
              foregroundStyle(colors.mutedForeground as string),
              multilineTextAlignment("center"),
            ]}
          >
            Your password has been reset. You can now sign in with your new password.
          </Text>
          <ProminentButton
            label="Sign in"
            onPress={() => {
              haptics.light();
              router.replace("/sign-in");
            }}
          />
          <Spacer />
        </VStack>
      </Host>
    );
  }

  const labelModifiers = [dfont({ size: 17, weight: "semibold" })];

  return (
    <Host style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        modifiers={[scrollDismissesKeyboard("interactively"), tint(colors.primary as string)]}
      >
        <VStack
          spacing={20}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 60, bottom: 40 })]}
        >
          <RNHostView matchContents>
            <ExpoImage
              source={brandIcon}
              style={{ width: 56, height: 56 } as never}
              accessibilityLabel="App icon"
              contentFit="contain"
            />
          </RNHostView>

          <VStack spacing={6} alignment="leading">
            <Text modifiers={[dfont({ size: 28, weight: "bold" })]}>Reset password</Text>
            <Text
              modifiers={[dfont({ size: 16 }), foregroundStyle(colors.mutedForeground as string)]}
            >
              Enter the 6-digit code sent to {email} and choose a new password.
            </Text>
          </VStack>

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>Account</Text>
            <TextField
              text={emailIdentityState}
              onTextChange={() => {}}
              modifiers={[
                ...inputModifiers,
                foregroundStyle(colors.mutedForeground as string),
                textContentType("username"),
                disabled(true),
                accessibilityLabel("Account email"),
              ]}
            />
          </VStack>

          {error && (
            <VStack spacing={8} alignment="leading">
              <ErrorText>{error}</ErrorText>
              {isExpiredError && (
                <Button
                  label="Request a new code"
                  modifiers={[buttonStyle("plain"), dfont({ size: 14 })]}
                  onPress={() => {
                    haptics.light();
                    router.push("/forgot-password");
                  }}
                />
              )}
            </VStack>
          )}

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>Verification code</Text>
            <TextField
              placeholder="000000"
              onTextChange={(text) => setOtp(text.replace(/\D/g, "").slice(0, 6))}
              autoFocus
              modifiers={[
                ...inputModifiers,
                keyboardType("numeric"),
                textContentType("oneTimeCode"),
                dfont({ size: 24, design: "monospaced" }),
                monospacedDigit(),
                kerning(8),
                multilineTextAlignment("center"),
                submitLabel("next"),
                disabled(isPending),
                accessibilityLabel("Verification code"),
                accessibilityHint("Enter the 6 digit code sent to your email"),
              ]}
            />
          </VStack>

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>New password</Text>
            <PasswordField
              onTextChange={setPassword}
              contentType="newPassword"
              disabled={isPending}
              submitLabelType="next"
              accessibilityLabel="New password"
              accessibilityHint="Choose a password with at least 10 characters"
            />
            <Text
              modifiers={[dfont({ size: 13 }), foregroundStyle(colors.mutedForeground as string)]}
            >
              At least 10 characters.
            </Text>
          </VStack>

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>Confirm password</Text>
            <PasswordField
              onTextChange={setConfirmPassword}
              onSubmit={() => startTransition(() => submit())}
              contentType="newPassword"
              disabled={isPending}
              accessibilityLabel="Confirm new password"
              accessibilityHint="Re-enter the new password to confirm"
            />
          </VStack>

          <ProminentButton
            label={isPending ? "Resetting..." : "Reset password"}
            onPress={() => startTransition(() => submit())}
            disabled={isPending}
          />

          <VStack alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
            <Button
              label="Back to sign in"
              modifiers={[
                buttonStyle("plain"),
                foregroundStyle(colors.mutedForeground as string),
                dfont({ size: 14, weight: "semibold" }),
              ]}
              onPress={() => {
                haptics.light();
                router.push("/sign-in");
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
