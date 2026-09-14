import { startTransition, useActionState, useEffect, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import { useQuery } from "convex/react";
import { Host, ScrollView, VStack, HStack, Text, Image, useNativeState } from "@expo/ui/swift-ui";
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
import { maskUsername } from "@/lib/masks";
import { setNativeValue } from "@/lib/native-state";
import BrandIcon from "@/components/ui/brand-icon";
import { ProminentButton } from "@/components/ui/capsule-button";
import { OtpVerification } from "@/components/auth/otp-verification";
import { CapsuleTextField } from "@/components/ui/capsule-text-field";
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog";
import { GuestOptions } from "@/components/auth/guest-options";
import { HelperText } from "@/components/ui/helper-text";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { PasswordField } from "@/components/auth/password-field";
import { AuthModeToggle } from "@/components/auth/auth-mode-toggle";
import { firstError, firstErrorField, signUpSchema } from "@/lib/schemas";
import { ErrorText } from "@/components/ui/status-text";
import { announce } from "@/lib/a11y";
import { UNEXPECTED_ERROR, fail, succeed } from "@/lib/form-result";
import { Colors } from "@/constants/theme";
import { useAppleAuth } from "@/hooks/use-apple-auth";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { useGuestSignIn } from "@/hooks/use-guest-sign-in";
import { AppleButton } from "@/components/auth/apple-button";
import { LabeledField } from "@/components/ui/labeled-field";

type SignUpState = { error?: string };
const initialState: SignUpState = {};

const ALREADY_EXISTS = "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";
const USERNAME_TAKEN = "USERNAME_IS_ALREADY_TAKEN";

type UsernameStatus = {
  text: string;
  color: string;
  icon: "ellipsis.circle" | "checkmark.circle.fill" | "exclamationmark.circle.fill";
};

function UsernameStatusRow({ status }: { status: UsernameStatus | null }) {
  const dfont = useDynamicFont();
  if (!status) return <HelperText>A unique handle others can use to find you.</HelperText>;
  return (
    <HStack spacing={6} alignment="center">
      <Image
        systemName={status.icon}
        color={status.color}
        modifiers={[dfont({ size: 13 }), accessibilityHidden(true)]}
      />
      <Text modifiers={[dfont({ size: 13 }), foregroundStyle(status.color)]}>{status.text}</Text>
    </HStack>
  );
}

export default function SignUpScreen() {
  const dfont = useDynamicFont();
  const nameFieldState = useNativeState("");
  const [name, setName] = useState("");
  const [prefilledName, setPrefilledName] = useState("");
  const usernameState = useNativeState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const apple = useAppleAuth({ successMessage: "Signed up with Apple" });
  const providers = useQuery(api.auth.getEnabledProviders);
  const showApple = apple.available && providers?.apple === true;
  const emailFeatures = providers?.emailFeatures === true;
  const { isGuest, name: sessionName } = useAuthStatus();
  const guest = useGuestSignIn();
  const showGuest = providers?.guest === true && !isGuest;
  const subtitle = isGuest
    ? "Your guest data comes with you, and you get it back on your next device."
    : emailFeatures
      ? "A verification code will be sent to confirm your email."
      : "Sign up and you're in. No email to confirm.";

  const activeField = useNativeState<string | null>(null);

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);

  useEffect(() => {
    setUsernameAvailable(null);
    const candidate = username.trim();
    if (!candidate || !isValidUsernameFormat(candidate)) return;
    if (isReservedUsername(candidate)) {
      setUsernameAvailable(false);
      return;
    }
    let cancelled = false;
    const id = setTimeout(async () => {
      setIsCheckingUsername(true);
      try {
        const result = await authClient.isUsernameAvailable({ username: candidate });
        if (!cancelled && result.data) setUsernameAvailable(result.data.available);
      } catch {
        // Leave it unknown, the server rejects a taken username on submit anyway.
      } finally {
        if (!cancelled) setIsCheckingUsername(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [username]);

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

  const hasInput =
    name !== prefilledName || username.length > 0 || email.length > 0 || password.length > 0;
  const { pendingNavAction, discard, dismiss } = useUnsavedChanges(hasInput && !showVerification);

  const [state, signUp, isPending] = useActionState<SignUpState, void>(async () => {
    const parsed = signUpSchema.safeParse({ name, username, email, password });
    if (!parsed.success) {
      const field = firstErrorField(parsed);
      if (field) setNativeValue(activeField, `field-${field}`);
      return fail(firstError(parsed)!);
    }

    try {
      const response = await authClient.signUp.email({
        email: parsed.data.email,
        password: parsed.data.password,
        name: parsed.data.name,
        ...(parsed.data.username ? { username: parsed.data.username } : {}),
      });

      if (response.error) {
        if (response.error.code === ALREADY_EXISTS && emailFeatures) {
          const sent = await authClient.emailOtp.sendVerificationOtp({
            email: parsed.data.email,
            type: "email-verification",
          });
          if (sent.error) {
            return fail("That code wouldn't send. Wait a minute and try again.");
          }
          succeed("Verification code sent");
          setShowVerification(true);
          return {};
        }
        if (response.error.code === USERNAME_TAKEN) {
          setNativeValue(activeField, "field-username");
          return fail(
            emailFeatures
              ? "That username is taken. If the account is yours, sign in with your email and we'll send a new code."
              : "That username is taken. Please choose another.",
          );
        }
        return fail("Unable to create account. Please try a different email or username.");
      }

      if (emailFeatures) {
        succeed("Account created. Check your email for the verification code.");
        setShowVerification(true);
        return {};
      }
      succeed("Account created. You're signed in.");
      return {};
    } catch {
      return fail(UNEXPECTED_ERROR);
    }
  }, initialState);

  const isLoading = [isPending, apple.isPending, guest.isPending].some(Boolean);
  const error = [state.error, apple.error, guest.error].find(Boolean);
  const usernameStatus: UsernameStatus | null = (() => {
    if (!username || !isValidUsernameFormat(username.trim().toLowerCase())) return null;
    if (isCheckingUsername) {
      return {
        text: "Checking availability...",
        color: Colors.mutedForeground,
        icon: "ellipsis.circle",
      };
    }
    if (usernameAvailable === true) {
      return {
        text: "Username is available",
        color: Colors.success,
        icon: "checkmark.circle.fill",
      };
    }
    if (usernameAvailable === false) {
      return {
        text: "This username is not available",
        color: Colors.destructive,
        icon: "exclamationmark.circle.fill",
      };
    }
    return null;
  })();

  if (showVerification) {
    return <OtpVerification email={email} onBack={() => setShowVerification(false)} />;
  }

  return (
    <Host style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView
        modifiers={[
          scrollDismissesKeyboard("interactively"),
          tint(Colors.primary),
          scrollPosition(activeField, { anchor: "top" }),
          defaultScrollAnchorForRole("center", "sizeChanges"),
        ]}
      >
        <VStack
          spacing={20}
          alignment="leading"
          modifiers={[padding({ horizontal: 24, top: 60, bottom: 40 }), scrollTargetLayout()]}
        >
          <BrandIcon />

          <VStack spacing={6} alignment="leading">
            <Text
              modifiers={[
                dfont({ size: 28, weight: "bold" }),
                accessibilityAddTraits(["isHeader"]),
              ]}
            >
              Create your account
            </Text>
            <Text modifiers={[dfont({ size: 16 }), foregroundStyle(Colors.mutedForeground)]}>
              {subtitle}
            </Text>
          </VStack>

          <AuthModeToggle current="sign-up" />

          {error && <ErrorText>{error}</ErrorText>}

          <LabeledField label="Name" modifiers={[id("field-name")]}>
            <CapsuleTextField
              text={nameFieldState}
              placeholder="Your name"
              onTextChange={setName}
              modifiers={[
                textInputAutocapitalization("words"),
                textContentType("name"),
                disabled(isLoading),
                submitLabel("next"),
                accessibilityLabel("Full name"),
                accessibilityHint("Enter the display name for your account"),
              ]}
            />
          </LabeledField>

          <LabeledField label="Username (optional)" modifiers={[id("field-username")]}>
            <CapsuleTextField
              text={usernameState}
              placeholder="johndoe"
              onTextChange={(text) => {
                "worklet";
                const next = maskUsername(text);
                usernameState.value = next;
                scheduleOnRN(setUsername, next);
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
            <UsernameStatusRow status={usernameStatus} />
          </LabeledField>

          <LabeledField label="Email" modifiers={[id("field-email")]}>
            <CapsuleTextField
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
          </LabeledField>

          <LabeledField label="Password" modifiers={[id("field-password")]}>
            <PasswordField
              onTextChange={setPassword}
              onSubmit={() => startTransition(() => signUp())}
              contentType="newPassword"
              disabled={isLoading}
              accessibilityLabel="Password"
              accessibilityHint="Choose a password with at least 10 characters"
            />
            <HelperText>At least 10 characters.</HelperText>
          </LabeledField>

          <ProminentButton
            label={isPending ? "Creating account..." : "Create account"}
            onPress={() => startTransition(() => signUp())}
            disabled={isLoading}
          />

          {showApple && (
            <AppleButton
              type={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              onPress={() => startTransition(() => apple.signIn())}
              disabled={isLoading}
            />
          )}

          <GuestOptions
            screen="sign-up"
            showGuest={showGuest}
            isGuest={isGuest}
            isLoading={isLoading}
            guest={guest}
          />
        </VStack>
      </ScrollView>

      <DiscardChangesDialog
        message="You have unsaved input that will be lost."
        pendingNavAction={pendingNavAction}
        onDiscard={discard}
        onDismiss={dismiss}
      />
    </Host>
  );
}
