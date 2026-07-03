import { startTransition, useActionState, useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";

import { api } from "@/convex/_generated/api";
import { Host, ScrollView, VStack, Button, Text, RNHostView } from "@expo/ui/swift-ui";
import {
  autocorrectionDisabled,
  foregroundStyle,
  buttonStyle,
  disabled,
  keyboardType,
  onSubmit,
  submitLabel,
  textContentType,
  textInputAutocapitalization,
  padding,
  frame,
  scrollDismissesKeyboard,
  accessibilityLabel,
  accessibilityHint,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { TouchTarget } from "@/constants/layout";

import { authClient } from "@/lib/auth-client";
import { assets } from "@/lib/assets";
import { haptics } from "@/lib/haptics";
import { firstError, forgotPasswordSchema } from "@/lib/schemas";
import { CapsuleTextField } from "@/components/ui/capsule-text-field";
import { ProminentButton } from "@/components/ui/prominent-button";
import { ErrorText } from "@/components/ui/status-text";
import { announce } from "@/lib/a11y";
import { useColors, useThemedAsset } from "@/hooks/use-theme";

type ForgotState = { error?: string };
const initialState: ForgotState = {};

export default function ForgotPasswordScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const brandIcon = useThemedAsset(assets.brandIconLight, assets.brandIconDark);
  const [email, setEmail] = useState("");
  const providers = useQuery(api.auth.getEnabledProviders);

  // Password reset requires the email-OTP flow which requires Resend. When
  // `REQUIRE_EMAIL_VERIFICATION` is unset on the Convex deployment, redirect
  // away. the sign-in screen also hides the "Forgot password?" link in that
  // mode, but a deeplinked navigation could still land here.
  useEffect(() => {
    if (providers !== undefined && providers.emailFeatures === false) {
      announce(
        "Password reset is unavailable until email verification is set up. Run npx vexpo full.",
      );
      router.replace("/auth/sign-in");
    }
  }, [providers]);

  const [state, submit, isPending] = useActionState<ForgotState, void>(async () => {
    haptics.light();

    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      haptics.error();
      return { error: firstError(parsed)! };
    }

    try {
      const response = await authClient.emailOtp.sendVerificationOtp({
        email: parsed.data.email,
        type: "forget-password",
      });

      if (response.error) {
        haptics.error();
        return { error: response.error.message ?? "Failed to send reset code" };
      }
      haptics.success();
      announce("Reset code sent");
      router.push({ pathname: "/auth/reset-password", params: { email: parsed.data.email } });
      return {};
    } catch {
      haptics.error();
      return { error: "An unexpected error occurred. Please try again." };
    }
  }, initialState);

  return (
    <Host testID="forgot-password-screen" style={{ flex: 1, backgroundColor: colors.background }}>
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
            <Text testID="forgot-password-title" modifiers={[dfont({ size: 28, weight: "bold" })]}>
              Reset your password
            </Text>
            <Text
              modifiers={[dfont({ size: 16 }), foregroundStyle(colors.mutedForeground as string)]}
            >
              Enter your email and we&apos;ll send you a 6-digit code.
            </Text>
          </VStack>

          {state.error && <ErrorText testID="forgot-password-error">{state.error}</ErrorText>}

          <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={[dfont({ size: 17, weight: "semibold" })]}>Email</Text>
            <CapsuleTextField
              testID="forgot-password-email"
              placeholder="you@example.com"
              onTextChange={setEmail}
              modifiers={[
                keyboardType("email-address"),
                autocorrectionDisabled(),
                textInputAutocapitalization("never"),
                textContentType("username"),
                onSubmit(() => startTransition(() => submit())),
                disabled(isPending),
                submitLabel("send"),
                accessibilityLabel("Email address"),
                accessibilityHint("Enter the email associated with your account"),
              ]}
            />
          </VStack>

          <ProminentButton
            testID="forgot-password-submit"
            label={isPending ? "Sending..." : "Send reset code"}
            onPress={() => startTransition(() => submit())}
            disabled={isPending}
          />

          <VStack alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
            <Button
              testID="forgot-password-back"
              label="Back to sign in"
              modifiers={[
                buttonStyle("plain"),
                foregroundStyle(colors.mutedForeground as string),
                dfont({ size: 14, weight: "semibold" }),
                frame({ minHeight: TouchTarget.min }),
              ]}
              onPress={() => {
                haptics.light();
                router.back();
              }}
            />
          </VStack>
        </VStack>
      </ScrollView>
    </Host>
  );
}
