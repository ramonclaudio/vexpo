import { startTransition, useActionState, useEffect, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import {
  Host,
  ScrollView,
  VStack,
  TextField,
  Button,
  Text,
  RNHostView,
  useNativeState,
} from "@expo/ui/swift-ui";
import { runOnJS } from "react-native-worklets";
import {
  autocorrectionDisabled,
  foregroundStyle,
  buttonStyle,
  background,
  clipShape,
  defaultScrollAnchorForRole,
  disabled,
  keyboardType,
  onSubmit as onSubmitModifier,
  submitLabel,
  textContentType,
  textFieldStyle,
  textInputAutocapitalization,
  padding,
  frame,
  scrollDismissesKeyboard,
  accessibilityLabel,
  accessibilityHint,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens } from "@/constants/layout";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { assets } from "@/lib/assets";
import { haptics } from "@/lib/haptics";
import { maskUsername } from "@/lib/masks";
import {
  firstError,
  forgotPasswordSchema,
  signInEmailSchema,
  signInUsernameSchema,
} from "@/lib/schemas";
import { OtpVerification } from "@/components/auth/otp-verification";
import { PasswordField } from "@/components/auth/password-field";
import { SegmentedToggle } from "@/components/auth/segmented-toggle";
import { ProminentButton } from "@/components/ui/prominent-button";
import { ErrorText } from "@/components/ui/status-text";
import { announce } from "@/lib/a11y";
import { useColors, useThemedAsset } from "@/hooks/use-theme";
import { AppleButton } from "@/components/auth/apple-button";

type SignInState = { error?: string; ok?: boolean };
const initialState: SignInState = {};

type SignInMethod = "email" | "username" | "otp";

export default function SignInScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const brandIcon = useThemedAsset(assets.brandIconLight, assets.brandIconDark);

  const [signInMethod, setSignInMethod] = useState<SignInMethod>("email");
  const [emailValue, setEmailValue] = useState("");
  const usernameFieldState = useNativeState("");
  const [usernameValue, setUsernameValue] = useState("");
  const [password, setPassword] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [showOtpVerification, setShowOtpVerification] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const providers = useQuery(api.auth.getEnabledProviders);
  const showApple = appleAvailable && providers?.apple === true;
  // Email features (OTP sign-in, password reset) require the Convex env to
  // have `REQUIRE_EMAIL_VERIFICATION=true` (set by `npx vexpo full`).
  // Until then, hide them so users don't hit a code-was-logged-to-console
  // dead end. Email + password sign-up/sign-in remains available.
  const emailFeatures = providers?.emailFeatures === true;
  const isOtp = signInMethod === "otp";

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const [emailState, signInWithEmail, isEmailPending] = useActionState<SignInState, void>(
    async () => {
      haptics.light();
      const parsed = signInEmailSchema.safeParse({ email: emailValue, password });
      if (!parsed.success) {
        haptics.error();
        return { error: firstError(parsed)! };
      }
      try {
        const response = await authClient.signIn.email({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (response.error) {
          haptics.error();
          return { error: response.error.message ?? "Invalid email or password" };
        }
        haptics.success();
        announce("Signed in");
        return { ok: true };
      } catch (e) {
        haptics.error();
        return {
          error: e instanceof Error ? e.message : "An unexpected error occurred. Please try again.",
        };
      }
    },
    initialState,
  );

  const [usernameState, signInWithUsername, isUsernamePending] = useActionState<SignInState, void>(
    async () => {
      haptics.light();
      const parsed = signInUsernameSchema.safeParse({ username: usernameValue, password });
      if (!parsed.success) {
        haptics.error();
        return { error: firstError(parsed)! };
      }
      try {
        const response = await authClient.signIn.username({
          username: parsed.data.username,
          password: parsed.data.password,
        });
        if (response.error) {
          haptics.error();
          return { error: response.error.message ?? "Invalid username or password" };
        }
        haptics.success();
        announce("Signed in");
        return { ok: true };
      } catch (e) {
        haptics.error();
        return {
          error: e instanceof Error ? e.message : "An unexpected error occurred. Please try again.",
        };
      }
    },
    initialState,
  );

  const [otpRequestState, sendSignInOtp, isSendingOtp] = useActionState<SignInState, void>(
    async () => {
      haptics.light();
      const parsed = forgotPasswordSchema.safeParse({ email: otpEmail });
      if (!parsed.success) {
        haptics.error();
        return { error: firstError(parsed)! };
      }
      try {
        const response = await authClient.emailOtp.sendVerificationOtp({
          email: parsed.data.email,
          type: "sign-in",
        });
        if (response.error) {
          haptics.error();
          return { error: response.error.message ?? "Failed to send sign-in code" };
        }
        haptics.success();
        announce("Sign-in code sent");
        setShowOtpVerification(true);
        return { ok: true };
      } catch (e) {
        haptics.error();
        return {
          error: e instanceof Error ? e.message : "An unexpected error occurred. Please try again.",
        };
      }
    },
    initialState,
  );

  const [appleState, signInWithApple, isApplePending] = useActionState<SignInState, void>(
    async () => {
      haptics.light();
      try {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });

        if (!credential.identityToken) {
          haptics.error();
          return { error: "Apple did not return an identity token" };
        }

        const response = await authClient.signIn.social({
          provider: "apple",
          idToken: { token: credential.identityToken },
        });

        if (response.error) {
          haptics.error();
          return { error: response.error.message ?? "Apple sign-in failed" };
        }
        haptics.success();
        announce("Signed in with Apple");
        return { ok: true };
      } catch (e) {
        if (e instanceof Error && "code" in e && e.code === "ERR_REQUEST_CANCELED") return {};
        haptics.error();
        return { error: e instanceof Error ? e.message : "Apple sign-in failed" };
      }
    },
    initialState,
  );

  const error =
    emailState.error ?? usernameState.error ?? otpRequestState.error ?? appleState.error;
  const isLoading = isEmailPending || isUsernamePending || isSendingOtp || isApplePending;

  if (showOtpVerification) {
    return (
      <OtpVerification
        email={otpEmail}
        flow="sign-in"
        onBack={() => setShowOtpVerification(false)}
      />
    );
  }

  const onSubmit = () => {
    if (signInMethod === "email") return signInWithEmail();
    if (signInMethod === "username") return signInWithUsername();
    return sendSignInOtp();
  };

  const primaryLabel = (() => {
    if (signInMethod === "otp") return isSendingOtp ? "Sending..." : "Send code";
    if (signInMethod === "email") return isEmailPending ? "Signing in..." : "Sign in";
    return isUsernamePending ? "Signing in..." : "Sign in";
  })();

  const labelModifiers = [dfont({ size: 17, weight: "semibold" })];
  const helperModifiers = [dfont({ size: 13 }), foregroundStyle(colors.mutedForeground as string)];
  const inputModifiers = [
    textFieldStyle("plain"),
    padding({ horizontal: 16 }),
    frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
    background(colors.muted as string),
    clipShape("capsule"),
    dfont({ size: 16 }),
  ];

  return (
    <Host testID="sign-in-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        modifiers={[
          scrollDismissesKeyboard("interactively"),
          tint(colors.primary as string),
          // Swapping the method toggle hides or shows a whole field group, the
          // biggest single-tap size change on this screen. Pin the visible
          // center so the user does not lose the field they were aiming for.
          // No-op below iOS 18. Ships via upstream expo/expo#43923.
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
              style={{ width: 56, height: 56 } as never}
              accessibilityLabel="App icon"
              contentFit="contain"
            />
          </RNHostView>

          <VStack spacing={6} alignment="leading">
            <Text testID="sign-in-title" modifiers={[dfont({ size: 28, weight: "bold" })]}>
              Sign in
            </Text>
            <Text
              modifiers={[dfont({ size: 16 }), foregroundStyle(colors.mutedForeground as string)]}
            >
              {isOtp
                ? "We'll email you a 6-digit code. No password needed."
                : "Enter your credentials to access your account."}
            </Text>
          </VStack>

          <SegmentedToggle
            testID="sign-in-auth-mode"
            accessibilityLabel="Sign in or sign up"
            value="sign-in"
            options={[
              { value: "sign-in", label: "Sign in" },
              { value: "sign-up", label: "Sign up" },
            ]}
            onChange={(v) => {
              if (v === "sign-up") router.replace("/auth/sign-up");
            }}
          />

          <SegmentedToggle
            testID="sign-in-method"
            accessibilityLabel="Sign-in method"
            value={signInMethod}
            options={
              emailFeatures
                ? [
                    { value: "email", label: "Email" },
                    { value: "username", label: "Username" },
                    { value: "otp", label: "Email OTP" },
                  ]
                : [
                    { value: "email", label: "Email" },
                    { value: "username", label: "Username" },
                  ]
            }
            onChange={(value) => setSignInMethod(value as SignInMethod)}
          />

          {error && <ErrorText testID="sign-in-error">{error}</ErrorText>}

          {signInMethod === "email" && (
            <>
              <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
                <Text modifiers={labelModifiers}>Email</Text>
                <TextField
                  testID="sign-in-email"
                  placeholder="you@example.com"
                  onTextChange={setEmailValue}
                  modifiers={[
                    ...inputModifiers,
                    keyboardType("email-address"),
                    autocorrectionDisabled(),
                    // upstream expo/expo#44547 + #44548: keyboard shift + autofill semantics
                    textInputAutocapitalization("never"),
                    textContentType("username"),
                    disabled(isLoading),
                    submitLabel("next"),
                    accessibilityLabel("Email address"),
                    accessibilityHint("Enter the email for your account"),
                  ]}
                />
              </VStack>
              <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
                <Text modifiers={labelModifiers}>Password</Text>
                <PasswordField
                  testID="sign-in-email-password"
                  onTextChange={setPassword}
                  onSubmit={() => startTransition(() => signInWithEmail())}
                  disabled={isLoading}
                  accessibilityLabel="Password"
                  accessibilityHint="Enter your account password"
                />
              </VStack>
              {emailFeatures && (
                <Button
                  testID="sign-in-email-forgot-password"
                  label="Forgot password?"
                  modifiers={[
                    buttonStyle("plain"),
                    foregroundStyle(colors.mutedForeground as string),
                    dfont({ size: 13 }),
                  ]}
                  onPress={() => {
                    haptics.light();
                    router.push("/auth/forgot-password");
                  }}
                />
              )}
            </>
          )}

          {signInMethod === "username" && (
            <>
              <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
                <Text modifiers={labelModifiers}>Username</Text>
                <TextField
                  testID="sign-in-username"
                  text={usernameFieldState}
                  placeholder="johndoe"
                  onTextChange={(text) => {
                    "worklet";
                    const next = maskUsername(text);
                    usernameFieldState.value = next;
                    runOnJS(setUsernameValue)(next);
                  }}
                  modifiers={[
                    ...inputModifiers,
                    keyboardType("ascii-capable"),
                    autocorrectionDisabled(),
                    textInputAutocapitalization("never"),
                    textContentType("username"),
                    disabled(isLoading),
                    submitLabel("next"),
                    accessibilityLabel("Username"),
                    accessibilityHint("Enter the username for your account"),
                  ]}
                />
              </VStack>
              <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
                <Text modifiers={labelModifiers}>Password</Text>
                <PasswordField
                  testID="sign-in-username-password"
                  onTextChange={setPassword}
                  onSubmit={() => startTransition(() => signInWithUsername())}
                  disabled={isLoading}
                  accessibilityLabel="Password"
                  accessibilityHint="Enter your account password"
                />
              </VStack>
              {emailFeatures && (
                <Button
                  testID="sign-in-username-forgot-password"
                  label="Forgot password?"
                  modifiers={[
                    buttonStyle("plain"),
                    foregroundStyle(colors.mutedForeground as string),
                    dfont({ size: 13 }),
                  ]}
                  onPress={() => {
                    haptics.light();
                    router.push("/auth/forgot-password");
                  }}
                />
              )}
            </>
          )}

          {signInMethod === "otp" && (
            <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
              <Text modifiers={labelModifiers}>Email</Text>
              <TextField
                testID="sign-in-otp-email"
                placeholder="you@example.com"
                onTextChange={setOtpEmail}
                modifiers={[
                  ...inputModifiers,
                  keyboardType("email-address"),
                  autocorrectionDisabled(),
                  textInputAutocapitalization("never"),
                  textContentType("username"),
                  onSubmitModifier(() => startTransition(() => sendSignInOtp())),
                  disabled(isLoading),
                  submitLabel("send"),
                  accessibilityLabel("Email address"),
                  accessibilityHint("Enter the email address for your account"),
                ]}
              />
              <Text modifiers={helperModifiers}>
                We&apos;ll email you a 6-digit code. No password needed.
              </Text>
            </VStack>
          )}

          <ProminentButton
            testID="sign-in-submit"
            label={primaryLabel}
            onPress={() => startTransition(onSubmit)}
            disabled={isLoading}
          />

          {!isOtp && showApple && (
            <AppleButton
              testID="sign-in-apple"
              type={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              onPress={() => startTransition(() => signInWithApple())}
              disabled={isLoading}
            />
          )}
        </VStack>
      </ScrollView>
    </Host>
  );
}
