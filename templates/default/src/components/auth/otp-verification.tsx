import { startTransition, useActionState, useState } from "react";
import {
  Host,
  ScrollView,
  VStack,
  HStack,
  Text,
  TextField,
  Button,
  Image,
  useNativeState,
} from "@expo/ui/swift-ui";
import { runOnJS } from "react-native-worklets";
import {
  foregroundStyle,
  buttonStyle,
  background,
  clipShape,
  contentShape,
  disabled,
  keyboardType,
  monospacedDigit,
  kerning,
  multilineTextAlignment,
  onSubmit,
  submitLabel,
  padding,
  frame,
  shapes,
  accessibilityElement,
  accessibilityHidden,
  accessibilityLabel,
  accessibilityHint,
  defaultScrollAnchorForRole,
  dynamicTypeSize,
  scrollDismissesKeyboard,
  tint,
  textContentType,
  textFieldStyle,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens, TouchTarget } from "@/constants/layout";
import { DynamicType } from "@/constants/ui";

import { authClient } from "@/lib/auth-client";
import { haptics } from "@/lib/haptics";
import { useColors } from "@/hooks/use-theme";
import { maskOtp } from "@/lib/masks";
import { ProminentButton } from "@/components/ui/prominent-button";
import { ErrorText } from "@/components/ui/status-text";
import { announce } from "@/lib/a11y";
import { accessibilityAddTraits } from "@/lib/ui-traits";

export type OtpFlow = "verify-email" | "sign-in";

type OtpVerificationProps = {
  email: string;
  onBack: () => void;
  /**
   * "verify-email" (default) confirms a fresh sign-up via
   * `authClient.emailOtp.verifyEmail` - the server has
   * `autoSignInAfterVerification: true` so a successful verify mints the
   * session inline. "sign-in" hits `authClient.signIn.emailOtp` to log a
   * returning user in passwordlessly.
   */
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
    haptics.light();

    if (otp.length !== 6) {
      haptics.error();
      return { error: "Please enter the 6-digit code" };
    }

    try {
      const response = isSignIn
        ? await authClient.signIn.emailOtp({ email: email.trim(), otp })
        : await authClient.emailOtp.verifyEmail({ email: email.trim(), otp });

      if (response.error) {
        haptics.error();
        return { error: "Invalid or expired code. Please try again." };
      }

      haptics.success();
      announce(isSignIn ? "Signed in" : "Email verified");
      return { ok: true };
    } catch {
      haptics.error();
      return {
        error: isSignIn
          ? "Sign in failed. Please try again."
          : "Verification failed. Please try again.",
      };
    }
  }, initialState);

  const [resendState, resend, isResending] = useActionState<OtpState, void>(async () => {
    haptics.light();
    try {
      const response = await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: isSignIn ? "sign-in" : "email-verification",
      });
      // Better Auth surfaces a 429 (the send-verification-otp rate limit) as a
      // returned error, not a throw, so announcing success unconditionally
      // would tell the user a code was sent when none was.
      if (response.error) {
        haptics.error();
        return { error: "Failed to send code. Please try again." };
      }
      haptics.success();
      announce("New verification code sent");
      return { ok: true };
    } catch {
      haptics.error();
      return { error: "Failed to send code. Please try again." };
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

  // Show the error from the action the user last ran. A plain
  // `verifyState.error ?? resendState.error` keeps a stale verify error on
  // screen after a successful resend, since resend never clears verifyState.
  const error = lastAction === "resend" ? resendState.error : verifyState.error;

  return (
    <Host testID="otp-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        modifiers={[
          scrollDismissesKeyboard("interactively"),
          tint(colors.primary as string),
          // The autoFocus OTP field keeps the keyboard up, and at AX sizes the
          // uncapped title and buttons overflow the remaining space. Scroll
          // like the sibling auth forms, keyboard reflow pinned to the visible
          // center. Anchor is a no-op below iOS 18, plain scroll on the floor.
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
            // upstream expo/expo#47156: combine the instruction and email into one VoiceOver stop; child testID moves to this root since combine collapses child ids
            modifiers={[accessibilityElement("combine")]}
          >
            <Text
              modifiers={[
                dfont({ size: 15 }),
                foregroundStyle(colors.mutedForeground as string),
                multilineTextAlignment("center"),
              ]}
            >
              Enter the 6-digit code sent to
            </Text>
            <Text modifiers={[dfont({ size: 15, weight: "semibold" })]}>{email}</Text>
          </VStack>

          {error && <ErrorText testID="otp-error">{error}</ErrorText>}

          <VStack spacing={12} modifiers={[frame({ maxWidth: Infinity })]}>
            <TextField
              testID="otp-field"
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
                textFieldStyle("plain"),
                padding({ horizontal: 16 }),
                frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
                background(colors.muted as string),
                clipShape("capsule"),
                dfont({ size: 24, design: "monospaced" }),
                monospacedDigit(),
                kerning(8),
                multilineTextAlignment("center"),
                // upstream expo/expo#46540: cap Dynamic Type on the fixed-height
                // capsule so six 24pt monospaced glyphs can't scale past the box.
                dynamicTypeSize({ max: DynamicType.otp }),
                keyboardType("numeric"),
                textContentType("oneTimeCode"),
                onSubmit(runVerify),
                submitLabel("done"),
                accessibilityLabel("Verification code"),
                accessibilityHint("Enter the 6 digit code sent to your email"),
              ]}
            />

            <ProminentButton
              testID="otp-verify"
              label={
                isVerifying
                  ? isSignIn
                    ? "Signing in..."
                    : "Verifying..."
                  : isSignIn
                    ? "Sign in"
                    : "Verify"
              }
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
                  foregroundStyle(colors.primary as string),
                ]}
              >
                {isResending ? "Sending..." : "Resend code"}
              </Text>
            </Button>
          </VStack>

          <HStack modifiers={[padding({ top: 8 })]}>
            <Text
              modifiers={[dfont({ size: 14 }), foregroundStyle(colors.mutedForeground as string)]}
            >
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
                haptics.light();
                onBack();
              }}
            />
          </HStack>
        </VStack>
      </ScrollView>
    </Host>
  );
}
