import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import { Image as ExpoImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useNavigation } from "expo-router";
import { useQuery } from "convex/react";
import {
  Host,
  ScrollView,
  VStack,
  HStack,
  TextField,
  Button,
  Text,
  Image,
  Spacer,
  RNHostView,
  ConfirmationDialog,
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
  textFieldStyle,
  textInputAutocapitalization,
  padding,
  frame,
  scrollDismissesKeyboard,
  accessibilityLabel,
  accessibilityHint,
  buttonStyle,
  contentShape,
  shapes,
  tint,
  background,
  border,
  clipShape,
  id,
  scrollPosition,
  scrollTargetLayout,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { useSymbolSize } from "@/lib/dynamic-symbol-size";
import { Button as ButtonTokens, TouchTarget } from "@/constants/layout";

import { api } from "@/convex/_generated/api";
import { isReservedUsername, isValidUsernameFormat } from "@/convex/constants";
import { runOnJS } from "react-native-worklets";

import { authClient } from "@/lib/auth-client";
import { assets } from "@/lib/assets";
import { haptics } from "@/lib/haptics";
import { maskUsername } from "@/lib/masks";
import { setNativeValue } from "@/lib/native-state";
import { OtpVerification, type PendingAvatar } from "@/components/auth/otp-verification";
import { PasswordField } from "@/components/auth/password-field";
import { SegmentedToggle } from "@/components/auth/segmented-toggle";
import { ProminentButton } from "@/components/ui/prominent-button";
import { firstError, firstErrorField, signUpSchema } from "@/lib/schemas";
import { ErrorText } from "@/components/ui/status-text";
import { announce } from "@/lib/a11y";
import { useColors, useThemedAsset } from "@/hooks/use-theme";
import { AppleButton } from "@/components/auth/apple-button";

type SignUpState = { error?: string; verify?: boolean };
const initialState: SignUpState = {};

const AVATAR_SIZE = 56;

export default function SignUpScreen() {
  const dfont = useDynamicFont();
  const symbolSize = useSymbolSize();
  const colors = useColors();
  const brandIcon = useThemedAsset(assets.brandIconLight, assets.brandIconDark);
  const [name, setName] = useState("");
  const usernameState = useNativeState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showVerification, setShowVerification] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const providers = useQuery(api.auth.getEnabledProviders);
  const showApple = appleAvailable && providers?.apple === true;
  // When `emailFeatures` is false (minimal-tier setup, no Resend), the
  // server auto-verifies on sign-up and the user is signed in immediately
  // no OTP step. When true (testflight tier+), the OTP verification
  // screen renders after sign-up.
  const emailFeatures = providers?.emailFeatures === true;

  // Avatar picked at sign-up. Held until verifyEmail mints the session, then
  // OtpVerification uploads it via generateAvatarUploadUrl + updateAvatar.
  const [pendingAvatar, setPendingAvatar] = useState<PendingAvatar | null>(null);
  const [avatarPicker, setAvatarPicker] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Bound to ScrollView via `scrollPosition`. Writing a field id scrolls the
  // form so that field aligns with the top of the viewport.
  const activeField = useNativeState<string | null>(null);

  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const usernameCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkUsernameAvailability = useCallback(async (candidate: string) => {
    setIsCheckingUsername(true);
    try {
      const result = await authClient.isUsernameAvailable({ username: candidate });
      if (result.data) setUsernameAvailable(result.data.available);
    } catch {
      setUsernameAvailable(null);
    } finally {
      setIsCheckingUsername(false);
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
      if (!trimmed || !isValidUsernameFormat(trimmed)) return;
      if (isReservedUsername(trimmed)) {
        setUsernameAvailable(false);
        return;
      }
      usernameCheckRef.current = setTimeout(() => {
        void checkUsernameAvailability(trimmed);
      }, 500);
    },
    [checkUsernameAvailability],
  );

  useEffect(
    () => () => {
      if (usernameCheckRef.current) clearTimeout(usernameCheckRef.current);
    },
    [],
  );

  const pickAvatar = useCallback(async (source: "library" | "camera") => {
    haptics.light();
    setAvatarPicker(false);
    // Wait for the action sheet to finish dismissing before opening the
    // picker. iOS refuses to present a second view controller while one is
    // still animating away.
    await new Promise((r) => setTimeout(r, 350));
    const perm =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      haptics.error();
      setAvatarError(source === "camera" ? "Camera access denied" : "Photos access denied");
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    };
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setAvatarError(null);
    setPendingAvatar({ uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg" });
  }, []);

  const removeAvatar = useCallback(() => {
    setAvatarPicker(false);
    haptics.medium();
    setPendingAvatar(null);
    setAvatarError(null);
  }, []);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  const navigation = useNavigation();
  const hasInput =
    name.length > 0 || username.length > 0 || email.length > 0 || password.length > 0;
  const [pendingNavAction, setPendingNavAction] = useState<
    Parameters<typeof navigation.dispatch>[0] | null
  >(null);
  useEffect(() => {
    if (!hasInput || showVerification) return;
    return navigation.addListener("beforeRemove", (e) => {
      e.preventDefault();
      setPendingNavAction(e.data.action);
    });
  }, [navigation, hasInput, showVerification]);

  const [state, signUp, isPending] = useActionState<SignUpState, void>(async () => {
    haptics.light();

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
        haptics.error();
        return { error: "Unable to create account. Please try a different email or username." };
      }

      haptics.success();
      if (emailFeatures) {
        announce("Account created. Check your email for the verification code.");
        setShowVerification(true);
        return { verify: true };
      }
      announce("Account created. You're signed in.");
      return { ok: true };
    } catch {
      haptics.error();
      return { error: "An unexpected error occurred. Please try again." };
    }
  }, initialState);

  const [appleState, signUpWithApple, isApplePending] = useActionState<SignUpState, void>(
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
          return { error: response.error.message ?? "Apple sign-up failed" };
        }
        haptics.success();
        announce("Signed up with Apple");
        return { verify: false };
      } catch (e) {
        if (e instanceof Error && "code" in e && e.code === "ERR_REQUEST_CANCELED") return {};
        haptics.error();
        return { error: "Apple sign-up failed" };
      }
    },
    initialState,
  );

  const isLoading = isPending || isApplePending;
  const error = state.error ?? appleState.error ?? avatarError;
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
    return (
      <OtpVerification
        email={email}
        pendingAvatar={pendingAvatar}
        onBack={() => setShowVerification(false)}
      />
    );
  }

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
    <Host style={{ flex: 1, backgroundColor: colors.background }}>
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
              style={{ width: 56, height: 56 } as never}
              accessibilityLabel="App icon"
              contentFit="contain"
            />
          </RNHostView>

          <VStack spacing={6} alignment="leading">
            <Text modifiers={[dfont({ size: 28, weight: "bold" })]}>Create your account</Text>
            <Text
              modifiers={[dfont({ size: 16 }), foregroundStyle(colors.mutedForeground as string)]}
            >
              A verification code will be sent to confirm your email.
            </Text>
          </VStack>

          <SegmentedToggle
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

          {error && <ErrorText>{error}</ErrorText>}

          <VStack spacing={10} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
            <Text modifiers={labelModifiers}>Profile photo (optional)</Text>
            <ConfirmationDialog
              title="Profile photo"
              isPresented={avatarPicker}
              onIsPresentedChange={setAvatarPicker}
              titleVisibility="visible"
            >
              <ConfirmationDialog.Trigger>
                <Button
                  modifiers={[
                    buttonStyle("plain"),
                    frame({ maxWidth: Infinity, minHeight: TouchTarget.min }),
                    contentShape(shapes.rectangle()),
                    accessibilityLabel(
                      pendingAvatar ? "Change profile photo" : "Add profile photo",
                    ),
                  ]}
                  onPress={() => {
                    haptics.light();
                    setAvatarPicker(true);
                  }}
                >
                  <HStack
                    spacing={16}
                    alignment="center"
                    modifiers={[frame({ maxWidth: Infinity })]}
                  >
                    {pendingAvatar ? (
                      <RNHostView matchContents>
                        <ExpoImage
                          source={{ uri: pendingAvatar.uri }}
                          style={
                            {
                              width: AVATAR_SIZE,
                              height: AVATAR_SIZE,
                              borderRadius: AVATAR_SIZE / 2,
                            } as never
                          }
                          contentFit="cover"
                          accessibilityLabel="Selected profile photo"
                        />
                      </RNHostView>
                    ) : (
                      <VStack
                        alignment="center"
                        modifiers={[
                          frame({ width: AVATAR_SIZE, height: AVATAR_SIZE }),
                          background(colors.muted as string),
                          border({ color: colors.border as string, width: 2 }),
                          clipShape("circle"),
                        ]}
                      >
                        <Image
                          systemName="camera"
                          size={symbolSize(20)}
                          color={colors.mutedForeground as string}
                          modifiers={[accessibilityLabel("")]}
                        />
                      </VStack>
                    )}
                    <Text modifiers={helperModifiers}>
                      {pendingAvatar ? "Photo selected" : "Tap to upload"}
                    </Text>
                    <Spacer />
                  </HStack>
                </Button>
              </ConfirmationDialog.Trigger>
              <ConfirmationDialog.Actions>
                <Button
                  label="Choose Photo"
                  systemImage="photo.on.rectangle"
                  onPress={() => pickAvatar("library")}
                />
                <Button
                  label="Take Photo"
                  systemImage="camera"
                  onPress={() => pickAvatar("camera")}
                />
                {pendingAvatar ? (
                  <Button label="Remove Photo" role="destructive" onPress={removeAvatar} />
                ) : null}
                <Button label="Cancel" role="cancel" />
              </ConfirmationDialog.Actions>
            </ConfirmationDialog>
          </VStack>

          <VStack
            spacing={6}
            alignment="leading"
            modifiers={[frame({ maxWidth: Infinity }), id("field-name")]}
          >
            <Text modifiers={labelModifiers}>Name</Text>
            <TextField
              placeholder="Your name"
              onTextChange={setName}
              modifiers={[
                ...inputModifiers,
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
            <TextField
              text={usernameState}
              placeholder="johndoe"
              onTextChange={(text) => {
                "worklet";
                const next = maskUsername(text);
                usernameState.value = next;
                runOnJS(handleUsernameChange)(next);
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
                accessibilityHint("Choose a unique handle, 3 to 30 characters"),
              ]}
            />
            {usernameStatus ? (
              <HStack spacing={6} alignment="center">
                <Image
                  systemName={usernameStatus.icon}
                  size={symbolSize(13)}
                  color={usernameStatus.color}
                  modifiers={[accessibilityLabel("")]}
                />
                <Text
                  modifiers={[dfont({ size: 13 }), foregroundStyle(usernameStatus.color as string)]}
                >
                  {usernameStatus.text}
                </Text>
              </HStack>
            ) : (
              <Text modifiers={helperModifiers}>A unique handle others can use to find you.</Text>
            )}
          </VStack>

          <VStack
            spacing={6}
            alignment="leading"
            modifiers={[frame({ maxWidth: Infinity }), id("field-email")]}
          >
            <Text modifiers={labelModifiers}>Email</Text>
            <TextField
              placeholder="you@example.com"
              onTextChange={setEmail}
              modifiers={[
                ...inputModifiers,
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
              onTextChange={setPassword}
              onSubmit={() => startTransition(() => signUp())}
              contentType="newPassword"
              disabled={isLoading}
              accessibilityLabel="Password"
              accessibilityHint="Enter a password with at least 10 characters"
            />
            <Text modifiers={helperModifiers}>At least 10 characters.</Text>
          </VStack>

          <ProminentButton
            label={isPending ? "Creating account..." : "Create account"}
            onPress={() => startTransition(() => signUp())}
            disabled={isLoading}
          />

          {showApple && (
            <AppleButton
              type={AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP}
              onPress={() => startTransition(() => signUpWithApple())}
              disabled={isLoading}
            />
          )}
        </VStack>
      </ScrollView>

      <ConfirmationDialog
        title="Discard changes?"
        isPresented={pendingNavAction !== null}
        onIsPresentedChange={(v) => {
          if (!v) setPendingNavAction(null);
        }}
        titleVisibility="visible"
      >
        <ConfirmationDialog.Trigger>
          <Spacer modifiers={[frame({ width: 0, height: 0 })]} />
        </ConfirmationDialog.Trigger>
        <ConfirmationDialog.Actions>
          <Button
            label="Discard"
            role="destructive"
            onPress={() => {
              haptics.warning();
              const action = pendingNavAction;
              setPendingNavAction(null);
              if (action) navigation.dispatch(action);
            }}
          />
          <Button label="Keep Editing" role="cancel" />
        </ConfirmationDialog.Actions>
        <ConfirmationDialog.Message>
          <Text modifiers={[dfont({ size: 16 })]}>You have unsaved input that will be lost.</Text>
        </ConfirmationDialog.Message>
      </ConfirmationDialog>
    </Host>
  );
}
