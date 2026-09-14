import { startTransition, useActionState, useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  Host,
  ScrollView,
  VStack,
  Button,
  Text,
  Image,
  Spacer,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  foregroundStyle,
  buttonStyle,
  defaultScrollAnchorForRole,
  disabled,
  dynamicTypeSize,
  padding,
  frame,
  contentShape,
  shapes,
  scrollDismissesKeyboard,
  multilineTextAlignment,
  textContentType,
  accessibilityAddTraits,
  accessibilityHidden,
  accessibilityLabel,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { TouchTarget } from "@/constants/layout";
import { DynamicType } from "@/constants/ui";

import { authClient } from "@/lib/auth-client";
import { firstError, resetPasswordSchema } from "@/lib/schemas";
import BrandIcon from "@/components/ui/brand-icon";
import { PasswordField } from "@/components/auth/password-field";
import { CapsuleTextField } from "@/components/ui/capsule-text-field";
import { OtpField } from "@/components/ui/otp-field";
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog";
import { HelperText } from "@/components/ui/helper-text";
import { PlainButton, ProminentButton } from "@/components/ui/capsule-button";
import { ErrorText } from "@/components/ui/status-text";
import { LabeledField } from "@/components/ui/labeled-field";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { announce } from "@/lib/a11y";
import { setNativeValue } from "@/lib/native-state";
import { UNEXPECTED_ERROR, fail, succeed } from "@/lib/form-result";
import { Colors } from "@/constants/theme";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";

type ResetState = { error?: string; ok?: boolean; expired?: boolean; badCode?: boolean };
const initialState: ResetState = {};

export default function ResetPasswordScreen() {
  const dfont = useDynamicFont();
  const { email = "", otp: linkOtp = "" } = useLocalSearchParams<{ email: string; otp?: string }>();
  const providers = useQuery(api.auth.getEnabledProviders);
  useEffect(() => {
    if (providers !== undefined && providers.emailFeatures === false) {
      announce(
        "Password reset is unavailable until email verification is set up. Run npx vexpo full.",
      );
      router.replace("/auth/sign-in");
    }
  }, [providers]);

  const otpState = useNativeState(linkOtp);
  const [otp, setOtp] = useState(linkOtp);
  useEffect(() => {
    if (!linkOtp) return;
    setNativeValue(otpState, linkOtp);
    setOtp(linkOtp);
  }, [linkOtp]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const emailIdentityState = useNativeState(email);

  const [state, submit, isPending] = useActionState<ResetState, void>(async () => {
    if (!email) {
      return { ...fail("Missing email. Start over from forgot password."), expired: true };
    }

    const parsed = resetPasswordSchema.safeParse({ email, otp, password, confirmPassword });
    if (!parsed.success) {
      return fail(firstError(parsed)!);
    }

    try {
      const response = await authClient.emailOtp.resetPassword({
        email: parsed.data.email,
        otp: parsed.data.otp,
        password: parsed.data.password,
      });

      if (response.error) {
        const message = response.error.message ?? "Failed to reset password";
        const lower = message.toLowerCase();
        if (lower.includes("expired") || lower.includes("invalid")) {
          return {
            ...fail("This code has expired. Request a new one."),
            expired: true,
            badCode: true,
          };
        }
        return fail(message);
      }
      succeed("Password reset");
      return { ok: true };
    } catch {
      return fail(UNEXPECTED_ERROR);
    }
  }, initialState);

  const hasInput = otp !== linkOtp || password.length > 0 || confirmPassword.length > 0;
  const { pendingNavAction, discard, dismiss } = useUnsavedChanges(hasInput && !state.ok);

  if (state.ok) {
    return (
      <Host style={{ flex: 1, backgroundColor: Colors.background }}>
        <VStack
          spacing={16}
          alignment="center"
          modifiers={[padding({ horizontal: 24 }), tint(Colors.primary)]}
        >
          <Spacer />
          <Image
            systemName="checkmark.circle.fill"
            color={Colors.success}
            modifiers={[
              dfont({ size: 56 }),
              dynamicTypeSize({ max: DynamicType.control }),
              accessibilityHidden(true),
            ]}
          />
          <Text
            modifiers={[dfont({ size: 28, weight: "bold" }), accessibilityAddTraits(["isHeader"])]}
          >
            Password reset!
          </Text>
          <Text
            modifiers={[
              dfont({ size: 15 }),
              foregroundStyle(Colors.mutedForeground),
              multilineTextAlignment("center"),
            ]}
          >
            Your password has been reset. You can now sign in with your new password.
          </Text>
          <ProminentButton
            label="Sign in"
            onPress={() => {
              router.replace("/auth/sign-in");
            }}
          />
          <Spacer />
        </VStack>
      </Host>
    );
  }

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
          modifiers={[padding({ horizontal: 24, top: 60, bottom: 40 })]}
        >
          <BrandIcon />

          <VStack spacing={6} alignment="leading">
            <Text
              modifiers={[
                dfont({ size: 28, weight: "bold" }),
                accessibilityAddTraits(["isHeader"]),
              ]}
            >
              Reset password
            </Text>
            <Text modifiers={[dfont({ size: 16 }), foregroundStyle(Colors.mutedForeground)]}>
              Enter the 6-digit code sent to {email} and choose a new password.
            </Text>
          </VStack>

          <LabeledField label="Account">
            <CapsuleTextField
              text={emailIdentityState}
              modifiers={[
                foregroundStyle(Colors.mutedForeground),
                textContentType("username"),
                disabled(true),
                accessibilityLabel("Account email"),
              ]}
            />
          </LabeledField>

          {state.error && (
            <VStack spacing={8} alignment="leading">
              <ErrorText>{state.error}</ErrorText>
              {state.expired && (
                <Button
                  label="Request a new code"
                  modifiers={[
                    buttonStyle("plain"),
                    dfont({ size: 14 }),
                    frame({ minHeight: TouchTarget.min }),
                    contentShape(shapes.rectangle()),
                  ]}
                  onPress={() => {
                    router.push("/auth/forgot-password");
                  }}
                />
              )}
            </VStack>
          )}

          <LabeledField label="Verification code">
            <OtpField
              text={otpState}
              hint="Enter the 6 digit code sent to your email"
              onChange={setOtp}
              submit="next"
              isVerifying={isPending}
              invalidCode={state.badCode === true}
            />
          </LabeledField>

          <LabeledField label="New password">
            <PasswordField
              onTextChange={setPassword}
              contentType="newPassword"
              disabled={isPending}
              submitLabelType="next"
              accessibilityLabel="New password"
              accessibilityHint="Choose a new password with at least 10 characters"
            />
            <HelperText>At least 10 characters.</HelperText>
          </LabeledField>

          <LabeledField label="Confirm password">
            <PasswordField
              onTextChange={setConfirmPassword}
              onSubmit={() => startTransition(() => submit())}
              contentType="newPassword"
              disabled={isPending}
              accessibilityLabel="Confirm new password"
              accessibilityHint="Re-enter the new password to confirm"
            />
          </LabeledField>

          <ProminentButton
            label={isPending ? "Resetting..." : "Reset password"}
            onPress={() => startTransition(() => submit())}
            disabled={isPending}
          />

          <VStack alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
            <PlainButton label="Back to sign in" onPress={() => router.push("/auth/sign-in")} />
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
