import { startTransition, useActionState, useState } from "react";
import {
  Host,
  ScrollView,
  VStack,
  HStack,
  Text,
  Button,
  Image,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  foregroundStyle,
  buttonStyle,
  contentShape,
  disabled,
  multilineTextAlignment,
  padding,
  frame,
  shapes,
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityHidden,
  defaultScrollAnchorForRole,
  dynamicTypeSize,
  scrollDismissesKeyboard,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { OtpField } from "@/components/ui/otp-field";
import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens, TouchTarget } from "@/constants/layout";
import { DynamicType } from "@/constants/ui";

import { authClient } from "@/lib/auth-client";
import { useColors } from "@/hooks/use-theme";
import { ProminentButton } from "@/components/ui/capsule-button";
import { ErrorText } from "@/components/ui/status-text";
import { fail, succeed } from "@/lib/form-result";

export type OtpFlow = "verify-email" | "sign-in";

type OtpVerificationProps = {
  email: string;
  onBack: () => void;
  flow?: OtpFlow;
};

type OtpState = { error?: string; ok?: boolean };
const initialState: OtpState = {};

export function OtpVerification({ email, onBack, flow = "verify-email" }: OtpVerificationProps) {
  const dfont = useDynamicFont();
  const colors = useColors();
  const otpState = useNativeState("");
  const [otp, setOtp] = useState("");
  const [lastAction, setLastAction] = useState<"verify" | "resend">("verify");
  const isSignIn = flow === "sign-in";

  const [verifyState, verify, isVerifying] = useActionState<OtpState, void>(async () => {
    const code = otpState.value;
    if (code.length !== 6) {
      return fail("Please enter the 6-digit code");
    }

    try {
      const response = isSignIn
        ? await authClient.signIn.emailOtp({ email: email.trim(), otp: code })
        : await authClient.emailOtp.verifyEmail({ email: email.trim(), otp: code });

      if (response.error) {
        return fail("Invalid or expired code. Please try again.");
      }

      succeed(isSignIn ? "Signed in" : "Email verified");
      return { ok: true };
    } catch {
      return fail(
        isSignIn ? "Sign in failed. Please try again." : "Verification failed. Please try again.",
      );
    }
  }, initialState);

  const [resendState, resend, isResending] = useActionState<OtpState, void>(async () => {
    try {
      const response = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: isSignIn ? "sign-in" : "email-verification",
      });
      if (response.error) {
        return fail("Failed to send code. Please try again.");
      }
      succeed("New verification code sent");
      return { ok: true };
    } catch {
      return fail("Failed to send code. Please try again.");
    }
  }, initialState);

  const runVerify = () => {
    setLastAction("verify");
    startTransition(() => verify());
  };
  const runResend = () => {
    setLastAction("resend");
    startTransition(() => resend());
  };

  const error = lastAction === "resend" ? resendState.error : verifyState.error;
  const invalidCode = lastAction === "verify" && !!verifyState.error;

  const verifyLabel = (() => {
    if (isVerifying) return isSignIn ? "Signing in..." : "Verifying...";
    return isSignIn ? "Sign in" : "Verify";
  })();

  return (
    <Host testID="otp-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        modifiers={[
          scrollDismissesKeyboard("interactively"),
          tint(colors.primary),
          defaultScrollAnchorForRole("center", "sizeChanges"),
        ]}
      >
        <VStack
          spacing={16}
          alignment="center"
          modifiers={[padding({ horizontal: 24, top: 60, bottom: 40 })]}
        >
          <Image
            systemName={isSignIn ? "lock.shield" : "envelope.badge"}
            color={colors.primary}
            modifiers={[
              dfont({ size: 56 }),
              dynamicTypeSize({ max: DynamicType.control }),
              accessibilityHidden(true),
            ]}
          />

          <Text
            testID="otp-title"
            modifiers={[
              dfont({ size: 28, weight: "bold" }),
              multilineTextAlignment("center"),
              accessibilityAddTraits(["isHeader"]),
            ]}
          >
            {isSignIn ? "Sign in with code" : "Verify your email"}
          </Text>

          <VStack
            testID="otp-email-value"
            spacing={4}
            alignment="center"
            modifiers={[accessibilityElement("combine")]}
          >
            <Text
              modifiers={[
                dfont({ size: 15 }),
                foregroundStyle(colors.mutedForeground),
                multilineTextAlignment("center"),
              ]}
            >
              Enter the 6-digit code sent to
            </Text>
            <Text modifiers={[dfont({ size: 15, weight: "semibold" })]}>{email}</Text>
          </VStack>

          {error && <ErrorText testID="otp-error">{error}</ErrorText>}

          <VStack spacing={12} modifiers={[frame({ maxWidth: Infinity })]}>
            <OtpField
              testID="otp-field"
              text={otpState}
              hint="Enter the 6 digit code sent to your email"
              onChange={setOtp}
              onVerify={runVerify}
              isVerifying={isVerifying}
              invalidCode={invalidCode}
            />

            <ProminentButton
              testID="otp-verify"
              label={verifyLabel}
              onPress={runVerify}
              disabled={isVerifying || otp.length !== 6}
            />

            <Button
              testID="otp-resend"
              modifiers={[
                buttonStyle("plain"),
                frame({ maxWidth: Infinity }),
                disabled(isResending),
              ]}
              onPress={runResend}
            >
              <Text
                modifiers={[
                  frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
                  multilineTextAlignment("center"),
                  dfont({ size: ButtonTokens.fontSize, weight: ButtonTokens.secondaryFontWeight }),
                  foregroundStyle(colors.primary),
                ]}
              >
                {isResending ? "Sending..." : "Resend code"}
              </Text>
            </Button>
          </VStack>

          <HStack modifiers={[padding({ top: 8 })]}>
            <Text modifiers={[dfont({ size: 14 }), foregroundStyle(colors.mutedForeground)]}>
              Wrong email?
            </Text>
            <Button
              testID="otp-back"
              label="Go back"
              modifiers={[
                buttonStyle("plain"),
                dfont({ size: 14, weight: "semibold" }),
                frame({ minHeight: TouchTarget.min }),
                contentShape(shapes.rectangle()),
              ]}
              onPress={() => {
                onBack();
              }}
            />
          </HStack>
        </VStack>
      </ScrollView>
    </Host>
  );
}
