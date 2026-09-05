import { startTransition, useActionState, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { Host, ScrollView, VStack, Button, Text, useNativeState } from "@expo/ui/swift-ui";
import { scheduleOnRN } from "react-native-worklets";
import {
  autocorrectionDisabled,
  foregroundStyle,
  buttonStyle,
  defaultScrollAnchorForRole,
  disabled,
  keyboardType,
  onSubmit as onSubmitModifier,
  submitLabel,
  textContentType,
  textInputAutocapitalization,
  padding,
  frame,
  contentShape,
  shapes,
  scrollDismissesKeyboard,
  accessibilityAddTraits,
  accessibilityLabel,
  accessibilityHint,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { TouchTarget } from "@/constants/layout";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { haptics } from "@/lib/haptics";
import { maskUsername } from "@/lib/masks";
import {
  firstError,
  forgotPasswordSchema,
  signInEmailSchema,
  signInUsernameSchema,
} from "@/lib/schemas";
import BrandIcon from "@/components/ui/brand-icon";
import { ProminentButton } from "@/components/ui/capsule-button";
import { OtpVerification, type OtpFlow } from "@/components/auth/otp-verification";
import { CapsuleTextField } from "@/components/ui/capsule-text-field";
import { GuestOptions } from "@/components/auth/guest-options";
import { HelperText } from "@/components/ui/helper-text";
import { PasswordField } from "@/components/auth/password-field";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { ErrorText } from "@/components/ui/status-text";
import { UNEXPECTED_ERROR, fail, succeed } from "@/lib/form-result";
import { useColors } from "@/hooks/use-theme";
import { useAppleAuth } from "@/hooks/use-apple-auth";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { useGuestSignIn } from "@/hooks/use-guest-sign-in";
import { AppleButton } from "@/components/auth/apple-button";
import { LabeledField } from "@/components/ui/labeled-field";

type SignInState = { error?: string };
const initialState: SignInState = {};

type SignInMethod = "email" | "username" | "otp";

const NOT_VERIFIED = "EMAIL_NOT_VERIFIED";

type MethodOption = { value: SignInMethod; label: string };

function methodOptions(emailFeatures: boolean): MethodOption[] {
  const base: MethodOption[] = [
    { value: "email", label: "Email" },
    { value: "username", label: "Username" },
  ];
  return emailFeatures ? [...base, { value: "otp", label: "Email OTP" }] : base;
}

function Subtitle({ isGuest, isOtp }: { isGuest: boolean; isOtp: boolean }) {
  const dfont = useDynamicFont();
  const colors = useColors();
  const text = isGuest
    ? "Sign in and everything you did as a guest comes with you."
    : isOtp
      ? "We'll email you a 6-digit code. No password needed."
      : "Enter your credentials to access your account.";
  return (
    <Text modifiers={[dfont({ size: 16 }), foregroundStyle(colors.mutedForeground)]}>{text}</Text>
  );
}

function ForgotPasswordLink({ testID }: { testID: string }) {
  const dfont = useDynamicFont();
  const colors = useColors();
  return (
    <Button
      testID={testID}
      label="Forgot password?"
      modifiers={[
        buttonStyle("plain"),
        foregroundStyle(colors.mutedForeground),
        dfont({ size: 13 }),
        frame({ minHeight: TouchTarget.min }),
        contentShape(shapes.rectangle()),
      ]}
      onPress={() => {
        router.push("/auth/forgot-password");
      }}
    />
  );
}

export default function SignInScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();

  const [signInMethod, setSignInMethod] = useState<SignInMethod>("email");
  const [emailValue, setEmailValue] = useState("");
  const usernameFieldState = useNativeState("");
  const [usernameValue, setUsernameValue] = useState("");
  const [password, setPassword] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [showOtpVerification, setShowOtpVerification] = useState(false);
  const [otpFlow, setOtpFlow] = useState<OtpFlow>("sign-in");
  const apple = useAppleAuth({ successMessage: "Signed in with Apple" });
  const providers = useQuery(api.auth.getEnabledProviders);
  const showApple = apple.available && providers?.apple === true;
  const emailFeatures = providers?.emailFeatures === true;
  const isOtp = signInMethod === "otp";
  const { isGuest } = useAuthStatus();
  const guest = useGuestSignIn();
  const showGuest = providers?.guest === true && !isGuest;

  const startEmailVerification = async (email: string): Promise<SignInState> => {
    const sent = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });
    if (sent.error) {
      return fail(
        "Your email still needs verifying, and the code wouldn't send. Wait a minute and try again.",
      );
    }
    succeed("Verification code sent");
    setOtpEmail(email);
    setOtpFlow("verify-email");
    setShowOtpVerification(true);
    return {};
  };

  const [emailState, signInWithEmail, isEmailPending] = useActionState<SignInState, void>(
    async () => {
      const parsed = signInEmailSchema.safeParse({ email: emailValue, password });
      if (!parsed.success) {
        return fail(firstError(parsed)!);
      }
      try {
        const response = await authClient.signIn.email({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (response.error) {
          if (response.error.code === NOT_VERIFIED) {
            return await startEmailVerification(parsed.data.email);
          }
          return fail(response.error.message ?? "Invalid email or password");
        }
        succeed("Signed in");
        return {};
      } catch {
        return fail(UNEXPECTED_ERROR);
      }
    },
    initialState,
  );

  const [usernameState, signInWithUsername, isUsernamePending] = useActionState<SignInState, void>(
    async () => {
      const parsed = signInUsernameSchema.safeParse({ username: usernameValue, password });
      if (!parsed.success) {
        return fail(firstError(parsed)!);
      }
      try {
        const response = await authClient.signIn.username({
          username: parsed.data.username,
          password: parsed.data.password,
        });
        if (response.error) {
          haptics.error();
          if (response.error.code === NOT_VERIFIED) {
            return {
              error:
                "This account still needs its email verified. Sign in with your email address and we'll send a new code.",
            };
          }
          return { error: response.error.message ?? "Invalid username or password" };
        }
        succeed("Signed in");
        return {};
      } catch {
        return fail(UNEXPECTED_ERROR);
      }
    },
    initialState,
  );

  const [otpRequestState, sendSignInOtp, isSendingOtp] = useActionState<SignInState, void>(
    async () => {
      const parsed = forgotPasswordSchema.safeParse({ email: otpEmail });
      if (!parsed.success) {
        return fail(firstError(parsed)!);
      }
      try {
        const response = await authClient.emailOtp.sendVerificationOtp({
          email: parsed.data.email,
          type: "sign-in",
        });
        if (response.error) {
          return fail(response.error.message ?? "Failed to send sign-in code");
        }
        succeed("Sign-in code sent");
        setOtpFlow("sign-in");
        setShowOtpVerification(true);
        return {};
      } catch {
        return fail(UNEXPECTED_ERROR);
      }
    },
    initialState,
  );

  const error = [
    emailState.error,
    usernameState.error,
    otpRequestState.error,
    apple.error,
    guest.error,
  ].find(Boolean);
  const isLoading = [
    isEmailPending,
    isUsernamePending,
    isSendingOtp,
    apple.isPending,
    guest.isPending,
  ].some(Boolean);

  if (showOtpVerification) {
    return (
      <OtpVerification
        email={otpEmail}
        flow={otpFlow}
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

  return (
    <Host testID="sign-in-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        modifiers={[
          scrollDismissesKeyboard("interactively"),
          tint(colors.primary),
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
              testID="sign-in-title"
              modifiers={[
                dfont({ size: 28, weight: "bold" }),
                accessibilityAddTraits(["isHeader"]),
              ]}
            >
              Sign in
            </Text>
            <Subtitle isGuest={isGuest} isOtp={isOtp} />
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
            options={methodOptions(emailFeatures)}
            onChange={(value) => setSignInMethod(value as SignInMethod)}
          />

          {error && <ErrorText testID="sign-in-error">{error}</ErrorText>}

          {signInMethod === "email" && (
            <>
              <LabeledField label="Email">
                <CapsuleTextField
                  testID="sign-in-email"
                  placeholder="you@example.com"
                  onTextChange={setEmailValue}
                  modifiers={[
                    keyboardType("email-address"),
                    autocorrectionDisabled(),
                    textInputAutocapitalization("never"),
                    textContentType("username"),
                    disabled(isLoading),
                    submitLabel("next"),
                    accessibilityLabel("Email address"),
                    accessibilityHint("Enter the email for your account"),
                  ]}
                />
              </LabeledField>
              <LabeledField label="Password">
                <PasswordField
                  testID="sign-in-email-password"
                  onTextChange={setPassword}
                  onSubmit={() => startTransition(() => signInWithEmail())}
                  disabled={isLoading}
                  accessibilityLabel="Password"
                  accessibilityHint="Enter your account password"
                />
              </LabeledField>
              {emailFeatures && <ForgotPasswordLink testID="sign-in-email-forgot-password" />}
            </>
          )}

          {signInMethod === "username" && (
            <>
              <LabeledField label="Username">
                <CapsuleTextField
                  testID="sign-in-username"
                  text={usernameFieldState}
                  placeholder="johndoe"
                  onTextChange={(text) => {
                    "worklet";
                    const next = maskUsername(text);
                    usernameFieldState.value = next;
                    scheduleOnRN(setUsernameValue, next);
                  }}
                  modifiers={[
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
              </LabeledField>
              <LabeledField label="Password">
                <PasswordField
                  testID="sign-in-username-password"
                  onTextChange={setPassword}
                  onSubmit={() => startTransition(() => signInWithUsername())}
                  disabled={isLoading}
                  accessibilityLabel="Password"
                  accessibilityHint="Enter your account password"
                />
              </LabeledField>
              {emailFeatures && <ForgotPasswordLink testID="sign-in-username-forgot-password" />}
            </>
          )}

          {signInMethod === "otp" && (
            <LabeledField label="Email">
              <CapsuleTextField
                testID="sign-in-otp-email"
                placeholder="you@example.com"
                onTextChange={setOtpEmail}
                modifiers={[
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
              <HelperText>We&apos;ll email you a 6-digit code. No password needed.</HelperText>
            </LabeledField>
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
              onPress={() => startTransition(() => apple.signIn())}
              disabled={isLoading}
            />
          )}

          <GuestOptions
            testIDPrefix="sign-in"
            showGuest={showGuest}
            isGuest={isGuest}
            isLoading={isLoading}
            guest={guest}
          />
        </VStack>
      </ScrollView>
    </Host>
  );
}
