import { startTransition, useActionState, useEffect, useState } from "react";
import { Image as ExpoImage } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import {
  Host,
  ScrollView,
  VStack,
  Button,
  Text,
  Image,
  Spacer,
  RNHostView,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  foregroundStyle,
  buttonStyle,
  defaultScrollAnchorForRole,
  disabled,
  dynamicTypeSize,
  keyboardType,
  padding,
  frame,
  contentShape,
  shapes,
  scrollDismissesKeyboard,
  multilineTextAlignment,
  monospacedDigit,
  kerning,
  submitLabel,
  textContentType,
  accessibilityAddTraits,
  accessibilityHidden,
  accessibilityLabel,
  accessibilityHint,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { TouchTarget } from "@/constants/layout";
import { DynamicType } from "@/constants/ui";

import { runOnJS } from "react-native-worklets";

import { authClient } from "@/lib/auth-client";
import { assets } from "@/lib/assets";
import { haptics } from "@/lib/haptics";
import { maskOtp } from "@/lib/masks";
import { firstError, resetPasswordSchema } from "@/lib/schemas";
import { PasswordField } from "@/components/auth/password-field";
import { CapsuleTextField } from "@/components/ui/capsule-text-field";
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog";
import { HelperText } from "@/components/ui/helper-text";
import { ProminentButton } from "@/components/ui/prominent-button";
import { ErrorText } from "@/components/ui/status-text";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { announce } from "@/lib/a11y";
import { useColors, useThemedAsset } from "@/hooks/use-theme";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

type ResetState = { error?: string; ok?: boolean; expired?: boolean };
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
      announce(
        "Password reset is unavailable until email verification is set up. Run npx vexpo full.",
      );
      router.replace("/auth/sign-in");
    }
  }, [providers]);

  const otpState = useNativeState("");
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
      return { error: "Missing email. Start over from forgot password.", expired: true };
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
          return { error: "This code has expired. Request a new one.", expired: true };
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

  const hasInput = otp.length > 0 || password.length > 0 || confirmPassword.length > 0;
  const { pendingNavAction, discard, dismiss } = useUnsavedChanges(hasInput && !state.ok);

  const error = state.error;
  const isExpiredError = state.expired === true;

  if (state.ok) {
    return (
      <Host
        testID="reset-password-success-screen"
        style={{ flex: 1, backgroundColor: colors.background }}
      >
        <VStack
          spacing={16}
          alignment="center"
          modifiers={[padding({ horizontal: 24 }), tint(colors.primary as string)]}
        >
          <Spacer />
          <Image
            testID="reset-password-success-icon"
            systemName="checkmark.circle.fill"
            color={colors.success}
            modifiers={[
              dfont({ size: 56 }),
              dynamicTypeSize({ max: DynamicType.control }),
              accessibilityHidden(true),
            ]}
          />
          <Text
            testID="reset-password-success-title"
            modifiers={[dfont({ size: 28, weight: "bold" }), accessibilityAddTraits(["isHeader"])]}
          >
            Password reset!
          </Text>
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
            testID="reset-password-success-sign-in"
            label="Sign in"
            onPress={() => {
              haptics.light();
              router.replace("/auth/sign-in");
            }}
          />
          <Spacer />
        </VStack>
      </Host>
    );
  }

  const labelModifiers = [dfont({ size: 17, weight: "semibold" })];

  return (
    <Host testID="reset-password-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        modifiers={[
          scrollDismissesKeyboard("interactively"),
          tint(colors.primary as string),
          // An invalid-code error appears between the account row and the OTP
          // field, pushing the password fields down. Pin the visible center so
          // the user stays on the field they were filling. No-op below iOS 18.
          defaultScrollAnchorForRole("center", "sizeChanges"),
        ]}
      >
        <VStack
          spacing={20}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 60, bottom: 40 })]}
        >
          <RNHostView matchContents>
            <ExpoImage
              source={brandIcon}
              style={{ width: 56, height: 56 }}
              accessibilityLabel="App icon"
              contentFit="contain"
            />
          </RNHostView>

          <VStack spacing={6} alignment="leading">
            <Text
              testID="reset-password-title"
              modifiers={[
                dfont({ size: 28, weight: "bold" }),
                accessibilityAddTraits(["isHeader"]),
              ]}
            >
              Reset password
            </Text>
            <Text
              modifiers={[dfont({ size: 16 }), foregroundStyle(colors.mutedForeground as string)]}
            >
              Enter the 6-digit code sent to {email} and choose a new password.
            </Text>
          </VStack>

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>Account</Text>
            <CapsuleTextField
              testID="reset-password-account"
              text={emailIdentityState}
              modifiers={[
                foregroundStyle(colors.mutedForeground as string),
                textContentType("username"),
                disabled(true),
                accessibilityLabel("Account email"),
              ]}
            />
          </VStack>

          {error && (
            <VStack spacing={8} alignment="leading">
              <ErrorText testID="reset-password-error">{error}</ErrorText>
              {isExpiredError && (
                <Button
                  testID="reset-password-request-code"
                  label="Request a new code"
                  modifiers={[
                    buttonStyle("plain"),
                    dfont({ size: 14 }),
                    frame({ minHeight: TouchTarget.min }),
                    contentShape(shapes.rectangle()),
                  ]}
                  onPress={() => {
                    haptics.light();
                    router.push("/auth/forgot-password");
                  }}
                />
              )}
            </VStack>
          )}

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>Verification code</Text>
            <CapsuleTextField
              testID="reset-password-code"
              text={otpState}
              placeholder="000000"
              onTextChange={(text) => {
                "worklet";
                const digits = maskOtp(text);
                otpState.value = digits;
                runOnJS(setOtp)(digits);
              }}
              autoFocus
              modifiers={[
                keyboardType("numeric"),
                textContentType("oneTimeCode"),
                dfont({ size: 24, design: "monospaced" }),
                monospacedDigit(),
                kerning(8),
                multilineTextAlignment("center"),
                // upstream expo/expo#46540: six monospaced glyphs in a capsule
                // that can't wrap, cap Dynamic Type so they don't overflow.
                dynamicTypeSize({ max: DynamicType.otp }),
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
              testID="reset-password-new"
              onTextChange={setPassword}
              contentType="newPassword"
              disabled={isPending}
              submitLabelType="next"
              accessibilityLabel="New password"
              accessibilityHint="Choose a password with at least 10 characters"
            />
            <HelperText>At least 10 characters.</HelperText>
          </VStack>

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>Confirm password</Text>
            <PasswordField
              testID="reset-password-confirm"
              onTextChange={setConfirmPassword}
              onSubmit={() => startTransition(() => submit())}
              contentType="newPassword"
              disabled={isPending}
              accessibilityLabel="Confirm new password"
              accessibilityHint="Re-enter the new password to confirm"
            />
          </VStack>

          <ProminentButton
            testID="reset-password-submit"
            label={isPending ? "Resetting..." : "Reset password"}
            onPress={() => startTransition(() => submit())}
            disabled={isPending}
          />

          <VStack alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
            <Button
              testID="reset-password-back-to-sign-in"
              label="Back to sign in"
              modifiers={[
                buttonStyle("plain"),
                foregroundStyle(colors.mutedForeground as string),
                dfont({ size: 14, weight: "semibold" }),
                frame({ minHeight: TouchTarget.min }),
                contentShape(shapes.rectangle()),
              ]}
              onPress={() => {
                haptics.light();
                router.push("/auth/sign-in");
              }}
            />
          </VStack>
        </VStack>
      </ScrollView>

      <DiscardChangesDialog
        testIDPrefix="reset-password"
        message="Your password entries will be lost."
        pendingNavAction={pendingNavAction}
        onDiscard={discard}
        onDismiss={dismiss}
      />
    </Host>
  );
}
