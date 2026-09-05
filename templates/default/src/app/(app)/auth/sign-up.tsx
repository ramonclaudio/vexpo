import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import {
  Host,
  ScrollView,
  VStack,
  HStack,
  Text,
  Image,
  RNHostView,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  autocorrectionDisabled,
  foregroundStyle,
  defaultScrollAnchorForRole,
  disabled,
  keyboardType,
  submitLabel,
  textContentType,
  textInputAutocapitalization,
  padding,
  frame,
  scrollDismissesKeyboard,
  accessibilityAddTraits,
  accessibilityHidden,
  accessibilityLabel,
  accessibilityHint,
  tint,
  id,
  scrollPosition,
  scrollTargetLayout,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";

import { api } from "@/convex/_generated/api";
import { GUEST_NAME, isReservedUsername, isValidUsernameFormat } from "@/convex/constants";
import { scheduleOnRN } from "react-native-worklets";

import { authClient } from "@/lib/auth-client";
import { assets } from "@/lib/assets";
import { haptics } from "@/lib/haptics";
import { maskUsername } from "@/lib/masks";
import { setNativeValue } from "@/lib/native-state";
import { OtpVerification } from "@/components/auth/otp-verification";
import { CapsuleTextField } from "@/components/ui/capsule-text-field";
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog";
import { HelperText } from "@/components/ui/helper-text";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { PasswordField } from "@/components/auth/password-field";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";
import { ProminentButton } from "@/components/ui/prominent-button";
import { SecondaryButton } from "@/components/ui/secondary-button";
import { firstError, firstErrorField, signUpSchema } from "@/lib/schemas";
import { ErrorText } from "@/components/ui/status-text";
import { announce } from "@/lib/a11y";
import { useColors, useThemedAsset } from "@/hooks/use-theme";
import { useAppleAuth } from "@/hooks/use-apple-auth";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { dismissAuth, useGuestSignIn } from "@/hooks/use-guest-sign-in";
import { AppleButton } from "@/components/auth/apple-button";

type SignUpState = { error?: string };
const initialState: SignUpState = {};

// Signing up again with the same address is what someone does after missing
// the first code, and "try a different email" is the wrong answer for it.
const ALREADY_EXISTS = "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";
// The username plugin checks availability in a `before` hook on
// /sign-up/email, so it throws ahead of the core email-exists check. Retyping
// the whole form lands here, not on ALREADY_EXISTS.
const USERNAME_TAKEN = "USERNAME_IS_ALREADY_TAKEN";

export default function SignUpScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const brandIcon = useThemedAsset(assets.brandIconLight, assets.brandIconDark);
  const nameFieldState = useNativeState("");
  const [name, setName] = useState("");
  // A name the guest set on their profile, carried into the form so they don't
  // retype it. `mergeGuestData` can't do this: the name lives on the Better
  // Auth user, not the app row, and overwriting whatever they type here with
  // the old one would be worse than asking.
  const [prefilledName, setPrefilledName] = useState("");
  const usernameState = useNativeState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const apple = useAppleAuth({ successMessage: "Signed up with Apple" });
  const providers = useQuery(api.auth.getEnabledProviders);
  const showApple = apple.available && providers?.apple === true;
  // When `emailFeatures` is false (minimal-tier setup, no Resend), the
  // server auto-verifies on sign-up and the user is signed in immediately
  // no OTP step. When true (testflight tier+), the OTP verification
  // screen renders after sign-up.
  const emailFeatures = providers?.emailFeatures === true;
  // Signing up from a guest session links the two accounts and carries the
  // guest's rows over, so the copy promises that and the wall becomes optional.
  const { isGuest, name: sessionName } = useAuthStatus();
  const guest = useGuestSignIn();
  const showGuest = providers?.guest === true && !isGuest;

  // Bound to ScrollView via `scrollPosition`. Writing a field id scrolls the
  // form so that field aligns with the top of the viewport.
  const activeField = useNativeState<string | null>(null);

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const usernameCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The candidate the latest keystroke is waiting on. A slow response whose
  // candidate no longer matches (newer keystroke, or unmount clears it to null)
  // is dropped so it can't overwrite fresher state or set state after unmount.
  const pendingCandidateRef = useRef<string | null>(null);

  const checkUsernameAvailability = useCallback(async (candidate: string) => {
    setIsCheckingUsername(true);
    try {
      const result = await authClient.isUsernameAvailable({ username: candidate });
      if (candidate !== pendingCandidateRef.current) return;
      if (result.data) setUsernameAvailable(result.data.available);
    } catch {
      if (candidate !== pendingCandidateRef.current) return;
      setUsernameAvailable(null);
    } finally {
      if (candidate === pendingCandidateRef.current) setIsCheckingUsername(false);
    }
  }, []);

  const handleUsernameChange = useCallback(
    (value: string) => {
      // `value` arrives already masked (lowercase, `[a-z0-9._]`) from the
      // field's worklet, so this only mirrors it and drives the availability
      // check off the JS thread.
      setUsername(value);
      setUsernameAvailable(null);
      if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current);
      const trimmed = value.trim();
      pendingCandidateRef.current = null;
      if (!trimmed || !isValidUsernameFormat(trimmed)) return;
      if (isReservedUsername(trimmed)) {
        setUsernameAvailable(false);
        return;
      }
      pendingCandidateRef.current = trimmed;
      usernameCheckRef.current = setTimeout(() => {
        void checkUsernameAvailability(trimmed);
      }, 500);
    },
    [checkUsernameAvailability],
  );

  useEffect(
    () => () => {
      if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current);
      pendingCandidateRef.current = null;
    },
    [],
  );

  // Key on the resolved boolean, not the status text, so the transient
  // "Checking..." tick and the per-keystroke null resets don't announce.
  useEffect(() => {
    if (usernameAvailable === true) announce("Username is available");
    else if (usernameAvailable === false) announce("This username is not available");
  }, [usernameAvailable]);

  useEffect(() => {
    if (!isGuest || !sessionName || sessionName === GUEST_NAME) return;
    if (prefilledName === sessionName) return;
    setPrefilledName(sessionName);
    setNativeValue(nameFieldState, sessionName);
    setName(sessionName);
  }, [isGuest, sessionName, prefilledName, nameFieldState]);

  // The prefilled name is not something the user typed, so it must not arm the
  // discard-changes dialog on its own.
  const hasInput =
    name !== prefilledName || username.length > 0 || email.length > 0 || password.length > 0;
  const { pendingNavAction, discard, dismiss } = useUnsavedChanges(hasInput && !showVerification);

  const [state, signUp, isPending] = useActionState<SignUpState, void>(async () => {
    const parsed = signUpSchema.safeParse({ name, username, email, password });
    if (!parsed.success) {
      haptics.error();
      const field = firstErrorField(parsed);
      if (field) setNativeValue(activeField, `field-${field}`);
      return { error: firstError(parsed)! };
    }

    try {
      // When `emailFeatures` is true (testflight-tier setup +), the server has
      // `sendVerificationOnSignUp` on and the response triggers an OTP email.
      // When false (minimal-tier), the server creates a verified account
      // immediately and Better Auth's `autoSignIn: true` returns a session
      // token in the same call. no OTP step, the user lands signed in.
      const response = await authClient.signUp.email({
        email: parsed.data.email,
        password: parsed.data.password,
        name: parsed.data.name,
        ...(parsed.data.username ? { username: parsed.data.username } : {}),
      });

      if (response.error) {
        if (response.error.code === ALREADY_EXISTS && emailFeatures) {
          // Better Auth's sendVerificationOtp returns success without sending
          // for an address it doesn't know, so the OTP screen appears whatever
          // was typed and only whoever reads that mailbox gets further. An
          // error here is a rate limit or a dropped request, never a verdict on
          // the address, so saying so leaks nothing and beats sending the user
          // to a screen no code will reach.
          const sent = await authClient.emailOtp.sendVerificationOtp({
            email: parsed.data.email,
            type: "email-verification",
          });
          if (sent.error) {
            haptics.error();
            return { error: "That code wouldn't send. Wait a minute and try again." };
          }
          haptics.success();
          announce("Verification code sent");
          setShowVerification(true);
          return {};
        }
        haptics.error();
        if (response.error.code === USERNAME_TAKEN) {
          // Don't route this one to the OTP screen. A username collision is
          // usually someone else's handle on a fresh address, and the code
          // would never arrive.
          setNativeValue(activeField, "field-username");
          return {
            error: emailFeatures
              ? "That username is taken. If the account is yours, sign in with your email and we'll send a new code."
              : "That username is taken. Please choose another.",
          };
        }
        return { error: "Unable to create account. Please try a different email or username." };
      }

      haptics.success();
      if (emailFeatures) {
        announce("Account created. Check your email for the verification code.");
        setShowVerification(true);
        return {};
      }
      announce("Account created. You're signed in.");
      return {};
    } catch {
      haptics.error();
      return { error: "An unexpected error occurred. Please try again." };
    }
  }, initialState);

  const isLoading = isPending || apple.isPending || guest.isPending;
  const error = state.error ?? apple.error ?? guest.error;
  // HIG: pair color with a non-color signal. The status row carries text +
  // color + an SF Symbol so a colorblind user gets the same answer.
  const usernameStatus: {
    text: string;
    color: string;
    icon: "ellipsis.circle" | "checkmark.circle.fill" | "exclamationmark.circle.fill";
  } | null = (() => {
    if (!username || !isValidUsernameFormat(username.trim().toLowerCase())) return null;
    if (isCheckingUsername) {
      return {
        text: "Checking availability...",
        color: colors.mutedForeground as string,
        icon: "ellipsis.circle",
      };
    }
    if (usernameAvailable === true) {
      return {
        text: "Username is available",
        color: colors.success as string,
        icon: "checkmark.circle.fill",
      };
    }
    if (usernameAvailable === false) {
      return {
        text: "This username is not available",
        color: colors.destructive as string,
        icon: "exclamationmark.circle.fill",
      };
    }
    return null;
  })();

  if (showVerification) {
    return <OtpVerification email={email} onBack={() => setShowVerification(false)} />;
  }

  const labelModifiers = [dfont({ size: 17, weight: "semibold" })];

  return (
    <Host testID="sign-up-screen" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        modifiers={[
          scrollDismissesKeyboard("interactively"),
          tint(colors.primary as string),
          scrollPosition(activeField, { anchor: "top" }),
          // Anchor the visible center on size changes so a username-availability
          // line appearing or a dynamic-type bump doesn't shift the field the
          // user is reading. No-op below iOS 18.
          defaultScrollAnchorForRole("center", "sizeChanges"),
        ]}
      >
        <VStack
          spacing={20}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 60, bottom: 40 }), scrollTargetLayout()]}
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
              testID="sign-up-title"
              modifiers={[
                dfont({ size: 28, weight: "bold" }),
                accessibilityAddTraits(["isHeader"]),
              ]}
            >
              Create your account
            </Text>
            <Text
              modifiers={[dfont({ size: 16 }), foregroundStyle(colors.mutedForeground as string)]}
            >
              {isGuest
                ? "Your guest data comes with you, and you get it back on your next device."
                : emailFeatures
                  ? "A verification code will be sent to confirm your email."
                  : "Sign up and you're in. No email to confirm."}
            </Text>
          </VStack>

          <SegmentedToggle
            testID="sign-up-auth-mode"
            accessibilityLabel="Sign in or sign up"
            value="sign-up"
            options={[
              { value: "sign-in", label: "Sign in" },
              { value: "sign-up", label: "Sign up" },
            ]}
            onChange={(v) => {
              if (v === "sign-in") router.replace("/auth/sign-in");
            }}
          />

          {error && <ErrorText testID="sign-up-error">{error}</ErrorText>}

          <VStack
            spacing={6}
            alignment="leading"
            modifiers={[frame({ maxWidth: Infinity }), id("field-name")]}
          >
            <Text modifiers={labelModifiers}>Name</Text>
            <CapsuleTextField
              testID="sign-up-name"
              text={nameFieldState}
              placeholder="Your name"
              onTextChange={setName}
              modifiers={[
                textInputAutocapitalization("words"),
                textContentType("name"),
                disabled(isLoading),
                submitLabel("next"),
                accessibilityLabel("Full name"),
                accessibilityHint("Enter the name to display on your account"),
              ]}
            />
          </VStack>

          <VStack
            spacing={6}
            alignment="leading"
            modifiers={[frame({ maxWidth: Infinity }), id("field-username")]}
          >
            <Text modifiers={labelModifiers}>Username (optional)</Text>
            <CapsuleTextField
              testID="sign-up-username"
              text={usernameState}
              placeholder="johndoe"
              onTextChange={(text) => {
                "worklet";
                const next = maskUsername(text);
                usernameState.value = next;
                scheduleOnRN(handleUsernameChange, next);
              }}
              modifiers={[
                keyboardType("ascii-capable"),
                autocorrectionDisabled(),
                textInputAutocapitalization("never"),
                textContentType("username"),
                disabled(isLoading),
                submitLabel("next"),
                accessibilityLabel("Username"),
                accessibilityHint("Choose a unique handle, 3 to 30 characters"),
              ]}
            />
            {usernameStatus ? (
              <HStack spacing={6} alignment="center">
                <Image
                  systemName={usernameStatus.icon}
                  color={usernameStatus.color}
                  modifiers={[dfont({ size: 13 }), accessibilityHidden(true)]}
                />
                <Text
                  testID="sign-up-username-status"
                  modifiers={[dfont({ size: 13 }), foregroundStyle(usernameStatus.color as string)]}
                >
                  {usernameStatus.text}
                </Text>
              </HStack>
            ) : (
              <HelperText>A unique handle others can use to find you.</HelperText>
            )}
          </VStack>

          <VStack
            spacing={6}
            alignment="leading"
            modifiers={[frame({ maxWidth: Infinity }), id("field-email")]}
          >
            <Text modifiers={labelModifiers}>Email</Text>
            <CapsuleTextField
              testID="sign-up-email"
              placeholder="you@example.com"
              onTextChange={setEmail}
              modifiers={[
                keyboardType("email-address"),
                autocorrectionDisabled(),
                textInputAutocapitalization("never"),
                textContentType("emailAddress"),
                disabled(isLoading),
                submitLabel("next"),
                accessibilityLabel("Email address"),
                accessibilityHint("Enter the email address you want to use for your account"),
              ]}
            />
          </VStack>

          <VStack
            spacing={6}
            alignment="leading"
            modifiers={[frame({ maxWidth: Infinity }), id("field-password")]}
          >
            <Text modifiers={labelModifiers}>Password</Text>
            <PasswordField
              testID="sign-up-password"
              onTextChange={setPassword}
              onSubmit={() => startTransition(() => signUp())}
              contentType="newPassword"
              disabled={isLoading}
              accessibilityLabel="Password"
              accessibilityHint="Enter a password with at least 10 characters"
            />
            <HelperText>At least 10 characters.</HelperText>
          </VStack>

          <ProminentButton
            testID="sign-up-submit"
            label={isPending ? "Creating account..." : "Create account"}
            onPress={() => startTransition(() => signUp())}
            disabled={isLoading}
          />

          {showApple && (
            <AppleButton
              testID="sign-up-apple"
              type={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              onPress={() => startTransition(() => apple.signIn())}
              disabled={isLoading}
            />
          )}

          {showGuest && (
            <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
              <SecondaryButton
                testID="sign-up-guest"
                label={guest.isPending ? "Starting..." : "Continue as guest"}
                onPress={() => startTransition(() => guest.signIn())}
                disabled={isLoading}
                inputLabels={["Continue as guest", "Guest", "Skip sign up"]}
              />
              <HelperText>You can create an account later and keep what you did.</HelperText>
            </VStack>
          )}

          {isGuest && (
            <SecondaryButton
              testID="sign-up-dismiss"
              label="Not now"
              onPress={dismissAuth}
              disabled={isLoading}
              filled={false}
            />
          )}
        </VStack>
      </ScrollView>

      <DiscardChangesDialog
        testIDPrefix="sign-up"
        message="You have unsaved input that will be lost."
        pendingNavAction={pendingNavAction}
        onDiscard={discard}
        onDismiss={dismiss}
      />
    </Host>
  );
}
