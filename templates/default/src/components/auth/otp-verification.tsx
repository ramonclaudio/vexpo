import { startTransition, useActionState, useState } from "react";
import { useMutation } from "convex/react";
import {
  Host,
  VStack,
  HStack,
  Text,
  TextField,
  Button,
  Image,
  Spacer,
  useNativeState,
} from "@expo/ui/swift-ui";
import { runOnJS } from "react-native-worklets";
import {
  foregroundStyle,
  buttonStyle,
  background,
  clipShape,
  disabled,
  keyboardType,
  monospacedDigit,
  kerning,
  multilineTextAlignment,
  onSubmit,
  submitLabel,
  padding,
  frame,
  accessibilityLabel,
  accessibilityHint,
  tint,
  textContentType,
  textFieldStyle,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { useSymbolSize } from "@/lib/dynamic-symbol-size";
import { Button as ButtonTokens } from "@/constants/layout";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { haptics } from "@/lib/haptics";
import { useColors } from "@/hooks/use-theme";
import { maskOtp } from "@/lib/masks";
import { ProminentButton } from "@/components/ui/prominent-button";
import { ErrorText } from "@/components/ui/status-text";
import { announce } from "@/lib/a11y";

export type PendingAvatar = { uri: string; mimeType: string };

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
  /**
   * Avatar picked during sign-up. Uploaded to Convex storage right after
   * verifyEmail succeeds and autoSignInAfterVerification mints the session.
   * Held in the parent's state so it's forgotten if the user backs out.
   * Ignored when `flow` is "sign-in" (existing accounts already have an
   * avatar configured from the profile screen).
   */
  pendingAvatar?: PendingAvatar | null;
};

type OtpState = { error?: string; ok?: boolean };
const initialState: OtpState = {};

export function OtpVerification({
  email,
  onBack,
  flow = "verify-email",
  pendingAvatar,
}: OtpVerificationProps) {
  const dfont = useDynamicFont();
  const symbolSize = useSymbolSize();
  const colors = useColors();
  const otpState = useNativeState("");
  const [otp, setOtp] = useState("");
  const [lastAction, setLastAction] = useState<"verify" | "resend">("verify");
  const generateAvatarUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const updateAvatar = useMutation(api.users.updateAvatar);
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

      // Upload the avatar picked at sign-up before this component unmounts.
      // Stack.Protected swaps (auth) -> (app) on the next render once the
      // session lands, but kicking off the requests here keeps them in flight
      // server-side regardless of the unmount. Failures are non-fatal: the
      // user is verified, they can set a photo from the profile screen.
      if (!isSignIn && pendingAvatar) {
        try {
          const uploadUrl = await generateAvatarUploadUrl();
          const blob = await (await fetch(pendingAvatar.uri)).blob();
          const upload = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": pendingAvatar.mimeType },
            body: blob,
          });
          if (upload.ok) {
            const { storageId } = (await upload.json()) as { storageId: string };
            await updateAvatar({ storageId: storageId as never });
          }
        } catch {}
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
      await authClient.emailOtp.sendVerificationOtp({
        email: email.trim(),
        type: isSignIn ? "sign-in" : "email-verification",
      });
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
    <Host style={{ flex: 1, backgroundColor: colors.background }}>
      <VStack
        spacing={16}
        alignment="center"
        modifiers={[padding({ horizontal: 24 }), tint(colors.primary as string)]}
      >
        <Spacer />

        <Image
          systemName={isSignIn ? "lock.shield" : "envelope.badge"}
          size={symbolSize(56)}
          color={colors.primary}
          modifiers={[accessibilityLabel("")]}
        />

        <Text modifiers={[dfont({ size: 28, weight: "bold" }), multilineTextAlignment("center")]}>
          {isSignIn ? "Sign in with code" : "Verify your email"}
        </Text>

        <VStack spacing={4} alignment="center">
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

        {error && <ErrorText>{error}</ErrorText>}

        <VStack spacing={12} modifiers={[frame({ maxWidth: Infinity })]}>
          <TextField
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
              frame({ maxWidth: Infinity, height: ButtonTokens.height }),
              background(colors.muted as string),
              clipShape("capsule"),
              dfont({ size: 24, design: "monospaced" }),
              monospacedDigit(),
              kerning(8),
              multilineTextAlignment("center"),
              keyboardType("numeric"),
              textContentType("oneTimeCode"),
              onSubmit(runVerify),
              submitLabel("done"),
              accessibilityLabel("Verification code"),
              accessibilityHint("Enter the 6 digit code sent to your email"),
            ]}
          />

          <ProminentButton
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
            modifiers={[buttonStyle("plain"), frame({ maxWidth: 10000 }), disabled(isResending)]}
            onPress={runResend}
          >
            <Text
              modifiers={[
                frame({ maxWidth: 10000, height: ButtonTokens.height }),
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
            label="Go back"
            modifiers={[buttonStyle("plain"), dfont({ size: 14, weight: "semibold" })]}
            onPress={() => {
              haptics.light();
              onBack();
            }}
          />
        </HStack>

        <Spacer />
      </VStack>
    </Host>
  );
}
