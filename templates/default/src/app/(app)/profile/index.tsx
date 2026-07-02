import { startTransition, useActionState, useEffect, useState } from "react";
import { Image as ExpoImage, useImage } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useDeleteAccount } from "@/hooks/use-delete-account";
import { router, Stack } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import {
  Host,
  ScrollView,
  Text,
  TextField,
  Button,
  HStack,
  VStack,
  Spacer,
  Image,
  RNHostView,
  Alert,
  ConfirmationDialog,
  ProgressView,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  autocorrectionDisabled,
  background,
  buttonStyle,
  clipShape,
  cornerRadius,
  defaultScrollAnchorForRole,
  dynamicTypeSize,
  foregroundStyle,
  disabled,
  keyboardType,
  lineLimit,
  onSubmit,
  submitLabel,
  textContentType,
  textFieldStyle,
  textInputAutocapitalization,
  monospacedDigit,
  kerning,
  multilineTextAlignment,
  padding,
  privacySensitive,
  frame,
  contentShape,
  shapes,
  progressViewStyle,
  scrollDismissesKeyboard,
  accessibilityElement,
  accessibilityHidden,
  accessibilityLabel,
  accessibilityHint,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useDynamicFont } from "@/lib/dynamic-font";
import { Button as ButtonTokens, TouchTarget } from "@/constants/layout";
import { DynamicType } from "@/constants/ui";

import { runOnJS } from "react-native-worklets";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { haptics } from "@/lib/haptics";
import { maskOtp, maskUsername } from "@/lib/masks";
import { setNativeValue } from "@/lib/native-state";
import {
  firstError,
  profileUpdateOptionalUsernameSchema,
  profileUpdateSchema,
} from "@/lib/schemas";
import { validateBio } from "@/convex/validators";
import { useColors } from "@/hooks/use-theme";
import { useScenePrivacy } from "@/hooks/use-scene-privacy";
import { ProminentButton } from "@/components/ui/prominent-button";
import { ErrorText, SuccessText } from "@/components/ui/status-text";
import { formatError } from "@/components/ui/convex-error";
import { SkeletonProfile } from "@/components/ui/skeleton";
import { announce } from "@/lib/a11y";

const AVATAR_SIZE = 96;

type SaveState = { error?: string; success?: string; pendingEmail?: string };
type OtpState = { error?: string; success?: string };

export default function ProfileScreen() {
  const dfont = useDynamicFont();
  const colors = useColors();
  const scenePrivacy = useScenePrivacy();
  const me = useQuery(api.users.getMe);
  const hasPasswordResult = useQuery(api.auth.hasPassword);
  // Email change requires the email-OTP flow which requires Resend. In lite
  // mode (`REQUIRE_EMAIL_VERIFICATION` unset) the email field is read-only
  // no way to send a verification code to the new address.
  const providers = useQuery(api.auth.getEnabledProviders);
  const emailFeatures = providers?.emailFeatures === true;
  const updateProfile = useMutation(api.users.updateProfile);
  const generateAvatarUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const updateAvatar = useMutation(api.users.updateAvatar);
  const deleteAvatar = useMutation(api.users.deleteAvatar);
  const removeAllTokens = useMutation(api.pushTokens.removeAll);
  const { deleteAccount, deleteError } = useDeleteAccount();

  // SwiftUI source of truth via useNativeState; mirrored to React state via
  // onTextChange so derived values like `hasChanges` stay reactive. Username
  // and the email-OTP field below add a "worklet" onTextChange so the mask
  // (lowercase / digits-only) rewrites the field synchronously on the UI
  // thread; name, email, and bio need no masking so they keep a plain mirror.
  const nameState = useNativeState(me?.name ?? "");
  const usernameState = useNativeState(me?.username ?? "");
  const emailState = useNativeState(me?.email ?? "");
  const bioState = useNativeState(me?.bio ?? "");
  const [name, setName] = useState(me?.name ?? "");
  const [username, setUsername] = useState(me?.username ?? "");
  const [email, setEmail] = useState(me?.email ?? "");
  const [bio, setBio] = useState(me?.bio ?? "");

  // `currentKey` collapses `(me._id, me.updatedAt)` into one stable dep so the
  // effect re-runs only when the row actually changes, not on every render
  // where `me` is a new object reference. Every read inside the effect is
  // derived from `me`, so depending on `me` itself would cause unwanted resets
  // when other render-triggered fields (e.g. unrelated query refetches) change.
  const currentKey = me ? `${me._id}:${me.updatedAt}` : null;
  useEffect(() => {
    if (!me) return;
    setNativeValue(nameState, me.name);
    setNativeValue(usernameState, me.username ?? "");
    setNativeValue(emailState, me.email);
    setNativeValue(bioState, me.bio ?? "");
    setName(me.name);
    setUsername(me.username ?? "");
    setEmail(me.email);
    setBio(me.bio ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const otpCodeState = useNativeState("");
  const [otp, setOtp] = useState("");
  const [avatarPicker, setAvatarPicker] = useState(false);
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false);
  const hasChanges =
    !!me &&
    (name.trim() !== me.name ||
      username.trim().toLowerCase() !== (me.username ?? "") ||
      email.trim().toLowerCase() !== me.email.toLowerCase() ||
      bio !== (me.bio ?? ""));

  const [saveState, save, isSaving] = useActionState<SaveState, void>(async () => {
    if (!me) return { error: "Not loaded" };
    haptics.light();

    // Accounts without a username must still save name/email/bio; the strict
    // schema would reject the empty username field they never set.
    const schema = me.username ? profileUpdateSchema : profileUpdateOptionalUsernameSchema;
    const parsed = schema.safeParse({ name, username, email });
    if (!parsed.success) {
      haptics.error();
      return { error: firstError(parsed)! };
    }

    const trimmedBio = bio.trim();
    const bioCheck = validateBio(trimmedBio);
    if (!bioCheck.valid) {
      haptics.error();
      return { error: bioCheck.error! };
    }

    const { name: nextName, username: nextUsername, email: nextEmail } = parsed.data;
    const nameChanged = nextName !== me.name;
    const usernameChanged = nextUsername !== (me.username ?? "");
    const emailChanged = nextEmail !== me.email.toLowerCase();
    const bioChanged = trimmedBio !== (me.bio ?? "");

    try {
      if (nameChanged || usernameChanged) {
        const updates: Record<string, string> = {};
        if (nameChanged) updates.name = nextName;
        if (usernameChanged) updates.username = nextUsername;
        const res = await authClient.updateUser(updates);
        if (res.error) {
          haptics.error();
          return { error: res.error.message ?? "Failed to update profile" };
        }
      }

      if (bioChanged) {
        await updateProfile({ bio: trimmedBio.length === 0 ? undefined : trimmedBio });
      }

      if (emailChanged) {
        const res = await authClient.changeEmail({ newEmail: nextEmail });
        if (res.error) {
          haptics.error();
          return { error: res.error.message ?? "Failed to update email" };
        }
        haptics.light();
        setPendingEmail(nextEmail);
        setOtp("");
        return { pendingEmail: nextEmail };
      }

      haptics.success();
      announce("Profile saved");
      return { success: "Saved" };
    } catch (err) {
      haptics.error();
      return { error: formatError(err) };
    }
  }, {} as SaveState);

  const [otpState, verifyOtp, isVerifying] = useActionState<OtpState, void>(async () => {
    haptics.light();
    if (!pendingEmail || otp.length !== 6) {
      haptics.error();
      return { error: "Enter the 6-digit code" };
    }
    try {
      const res = await authClient.emailOtp.verifyEmail({ email: pendingEmail, otp });
      if (res.error) {
        haptics.error();
        return { error: "Invalid or expired code" };
      }
      haptics.success();
      announce("Email updated");
      setPendingEmail(null);
      setOtp("");
      return { success: "Email updated" };
    } catch {
      haptics.error();
      return { error: "Verification failed" };
    }
  }, {} as OtpState);

  const [avatarUpdating, setAvatarUpdating] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const pickAvatar = async (source: "library" | "camera") => {
    haptics.light();
    setAvatarPicker(false);
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

    try {
      setAvatarError(null);
      setAvatarUpdating(true);
      const uploadUrl = await generateAvatarUploadUrl();
      const blob = await (await fetch(asset.uri)).blob();
      const upload = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": asset.mimeType ?? "image/jpeg" },
        body: blob,
      });
      if (!upload.ok) throw new Error(`Upload failed: ${upload.status}`);
      const { storageId } = (await upload.json()) as { storageId: string };
      await updateAvatar({ storageId: storageId as never });
      haptics.success();
      announce("Profile photo updated");
    } catch (err) {
      haptics.error();
      setAvatarError(formatError(err));
    } finally {
      setAvatarUpdating(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarPicker(false);
    haptics.medium();
    try {
      setAvatarError(null);
      setAvatarUpdating(true);
      await deleteAvatar();
      haptics.success();
      announce("Profile photo removed");
    } catch (err) {
      haptics.error();
      setAvatarError(formatError(err));
    } finally {
      setAvatarUpdating(false);
    }
  };

  const handleSignOut = async () => {
    haptics.medium();
    // Push-token cleanup is best-effort. A stale token gets garbage-collected
    // by `pushTokens.cleanupStale` after 30 days, so don't gate sign-out on it.
    try {
      await removeAllTokens();
    } catch (err) {
      if (__DEV__) console.warn("[signOut] removeAllTokens failed:", err);
    }
    await authClient.signOut();
  };

  const error = saveState.error ?? otpState.error ?? avatarError ?? deleteError;
  const success = saveState.success ?? otpState.success;

  if (!me) {
    return (
      <Host testID="profile-loading" style={{ flex: 1, backgroundColor: colors.background }}>
        <SkeletonProfile testID="profile-skeleton" />
      </Host>
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
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="checkmark.circle.fill"
          onPress={() => startTransition(() => save())}
          disabled={!hasChanges || isSaving}
          tintColor={colors.primary}
          accessibilityLabel="Save"
        />
      </Stack.Toolbar>

      <Host
        testID="profile-screen"
        style={{ flex: 1, backgroundColor: colors.background }}
        // upstream expo/expo#47269: raises redacted("privacy") when the app
        // resigns, hiding privacySensitive leaves in the app-switcher snapshot
        modifiers={scenePrivacy}
      >
        <ScrollView
          modifiers={[
            scrollDismissesKeyboard("interactively"),
            tint(colors.primary as string),
            // Keep the visible center pinned when an inline error or the avatar
            // sheet expands the form so the user doesn't jump to a new section.
            // No-op below iOS 18.
            defaultScrollAnchorForRole("center", "sizeChanges"),
          ]}
        >
          <VStack
            spacing={20}
            alignment="leading"
            modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
          >
            <ConfirmationDialog
              title="Profile photo"
              isPresented={avatarPicker}
              onIsPresentedChange={setAvatarPicker}
              titleVisibility="visible"
            >
              <ConfirmationDialog.Trigger>
                <Button
                  testID="profile-avatar"
                  modifiers={[
                    buttonStyle("plain"),
                    frame({ maxWidth: Infinity, minHeight: TouchTarget.min }),
                    contentShape(shapes.rectangle()),
                    accessibilityLabel("Change profile photo"),
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
                    <AvatarView avatarUrl={me.avatarUrl} loading={avatarUpdating} />
                    <VStack alignment="leading" spacing={4}>
                      <Text
                        testID="profile-name-value"
                        modifiers={[dfont({ size: 17, weight: "semibold" })]}
                      >
                        {me.name}
                      </Text>
                      <Text
                        testID="profile-email-value"
                        modifiers={[
                          dfont({ size: 14 }),
                          foregroundStyle(colors.mutedForeground as string),
                          privacySensitive(),
                        ]}
                      >
                        {me.email}
                      </Text>
                    </VStack>
                    <Spacer />
                    <Image
                      systemName="camera.circle.fill"
                      color={colors.primary as string}
                      modifiers={[
                        dfont({ size: 28 }),
                        dynamicTypeSize({ max: DynamicType.control }),
                        accessibilityHidden(true),
                      ]}
                    />
                  </HStack>
                </Button>
              </ConfirmationDialog.Trigger>
              <ConfirmationDialog.Actions>
                <Button
                  testID="profile-avatar-choose"
                  label="Choose Photo"
                  systemImage="photo.on.rectangle"
                  onPress={() => pickAvatar("library")}
                />
                <Button
                  testID="profile-avatar-take"
                  label="Take Photo"
                  systemImage="camera"
                  onPress={() => pickAvatar("camera")}
                />
                {me.hasUploadedAvatar && (
                  <Button
                    testID="profile-avatar-remove"
                    label="Remove Photo"
                    role="destructive"
                    onPress={removeAvatar}
                  />
                )}
                <Button testID="profile-avatar-cancel" label="Cancel" role="cancel" />
              </ConfirmationDialog.Actions>
            </ConfirmationDialog>

            {error ? <ErrorText testID="profile-error">{error}</ErrorText> : null}
            {success && !pendingEmail ? (
              <SuccessText testID="profile-success">{success}</SuccessText>
            ) : null}

            {pendingEmail ? (
              <>
                <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
                  <Text modifiers={labelModifiers}>Verify new email</Text>
                  <TextField
                    testID="profile-email-otp"
                    text={otpCodeState}
                    placeholder="000000"
                    onTextChange={(text) => {
                      "worklet";
                      const digits = maskOtp(text);
                      otpCodeState.value = digits;
                      runOnJS(setOtp)(digits);
                    }}
                    autoFocus
                    modifiers={[
                      ...inputModifiers,
                      keyboardType("numeric"),
                      textContentType("oneTimeCode"),
                      onSubmit(() => startTransition(() => verifyOtp())),
                      dfont({ size: 24, design: "monospaced" }),
                      monospacedDigit(),
                      kerning(8),
                      multilineTextAlignment("center"),
                      // upstream expo/expo#46540: six monospaced glyphs in a
                      // capsule that can't wrap, cap Dynamic Type so they fit.
                      dynamicTypeSize({ max: DynamicType.otp }),
                      submitLabel("done"),
                      disabled(isVerifying),
                      accessibilityLabel("Verification code"),
                      accessibilityHint("Enter the 6 digit code sent to your new email"),
                    ]}
                  />
                  <Text testID="profile-email-otp-sent" modifiers={helperModifiers}>
                    A 6-digit code was sent to {pendingEmail}.
                  </Text>
                </VStack>

                <ProminentButton
                  testID="profile-email-verify"
                  label={isVerifying ? "Verifying..." : "Verify"}
                  onPress={() => startTransition(() => verifyOtp())}
                  disabled={isVerifying || otp.length !== 6}
                />

                <VStack alignment="center" modifiers={[frame({ maxWidth: Infinity })]}>
                  <Button
                    testID="profile-email-verify-cancel"
                    label="Cancel"
                    modifiers={[
                      buttonStyle("plain"),
                      foregroundStyle(colors.mutedForeground as string),
                      dfont({ size: 14, weight: "semibold" }),
                      frame({ minHeight: TouchTarget.min }),
                      contentShape(shapes.rectangle()),
                      disabled(isVerifying),
                    ]}
                    onPress={() => {
                      haptics.light();
                      setPendingEmail(null);
                      setOtp("");
                    }}
                  />
                </VStack>
              </>
            ) : (
              <>
                <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
                  <Text modifiers={labelModifiers}>Name</Text>
                  <TextField
                    testID="profile-name"
                    text={nameState}
                    placeholder="Name"
                    onTextChange={setName}
                    modifiers={[
                      ...inputModifiers,
                      textInputAutocapitalization("words"),
                      textContentType("name"),
                      disabled(isSaving),
                      submitLabel("next"),
                      accessibilityLabel("Name"),
                      accessibilityHint("Edit the display name on your account"),
                    ]}
                  />
                </VStack>

                <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
                  <Text modifiers={labelModifiers}>Username</Text>
                  <TextField
                    testID="profile-username"
                    text={usernameState}
                    placeholder="johndoe"
                    onTextChange={(text) => {
                      "worklet";
                      const next = maskUsername(text);
                      usernameState.value = next;
                      runOnJS(setUsername)(next);
                    }}
                    modifiers={[
                      ...inputModifiers,
                      keyboardType("ascii-capable"),
                      autocorrectionDisabled(),
                      textInputAutocapitalization("never"),
                      textContentType("username"),
                      disabled(isSaving),
                      submitLabel("next"),
                      accessibilityLabel("Username"),
                      accessibilityHint("Edit the username for your profile"),
                    ]}
                  />
                  <Text modifiers={helperModifiers}>
                    Name and username are visible to other users.
                  </Text>
                </VStack>

                <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
                  <Text modifiers={labelModifiers}>Email</Text>
                  <TextField
                    testID="profile-email"
                    text={emailState}
                    placeholder="you@example.com"
                    onTextChange={setEmail}
                    modifiers={[
                      ...inputModifiers,
                      keyboardType("email-address"),
                      autocorrectionDisabled(),
                      textInputAutocapitalization("never"),
                      textContentType("emailAddress"),
                      privacySensitive(),
                      disabled(isSaving || !emailFeatures),
                      submitLabel("next"),
                      accessibilityLabel("Email address"),
                      accessibilityHint(
                        emailFeatures
                          ? "Edit the email address for your account"
                          : "Email change is disabled until email verification is configured",
                      ),
                    ]}
                  />
                  <Text modifiers={helperModifiers}>
                    {emailFeatures
                      ? "Changing your email requires verifying the new address with a 6-digit code."
                      : "Email change requires Resend setup. Run `npx vexpo full` to enable."}
                  </Text>
                </VStack>

                <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
                  <Text modifiers={labelModifiers}>Bio</Text>
                  <TextField
                    testID="profile-bio"
                    text={bioState}
                    placeholder="Tell others about yourself"
                    onTextChange={setBio}
                    axis="vertical"
                    modifiers={[
                      textFieldStyle("plain"),
                      padding({ horizontal: 16, vertical: 12 }),
                      frame({ maxWidth: Infinity }),
                      background(colors.muted as string),
                      cornerRadius(20),
                      dfont({ size: 16 }),
                      lineLimit({ min: 1, max: 4 }),
                      disabled(isSaving),
                      submitLabel("done"),
                      accessibilityLabel("Bio"),
                      accessibilityHint("Up to 500 characters describing yourself"),
                    ]}
                  />
                  <Text modifiers={helperModifiers}>
                    Up to 500 characters. Visible on your public profile.
                  </Text>
                </VStack>

                <VStack
                  testID="profile-member-since"
                  spacing={6}
                  alignment="leading"
                  modifiers={[frame({ maxWidth: Infinity }), accessibilityElement("combine")]}
                >
                  <Text modifiers={labelModifiers}>Member since</Text>
                  <Text
                    modifiers={[
                      dfont({ size: 16 }),
                      foregroundStyle(colors.mutedForeground as string),
                    ]}
                  >
                    {formatDate(me.createdAt)}
                  </Text>
                </VStack>

                {hasChanges ? (
                  <ProminentButton
                    testID="profile-save"
                    label={isSaving ? "Saving..." : "Save changes"}
                    onPress={() => startTransition(() => save())}
                    disabled={isSaving}
                  />
                ) : null}

                {hasPasswordResult ? (
                  <Button
                    testID="profile-change-password"
                    modifiers={[
                      buttonStyle("plain"),
                      frame({ maxWidth: Infinity }),
                      background(colors.muted as string),
                      clipShape("capsule"),
                    ]}
                    onPress={() => {
                      haptics.light();
                      router.push("/profile/change-password");
                    }}
                  >
                    <Text
                      modifiers={[
                        frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
                        multilineTextAlignment("center"),
                        dfont({
                          size: ButtonTokens.fontSize,
                          weight: ButtonTokens.secondaryFontWeight,
                        }),
                        foregroundStyle(colors.foreground as string),
                      ]}
                    >
                      Change password
                    </Text>
                  </Button>
                ) : null}

                <ConfirmationDialog
                  title="Sign out?"
                  isPresented={signOutConfirm}
                  onIsPresentedChange={setSignOutConfirm}
                  titleVisibility="visible"
                >
                  <ConfirmationDialog.Trigger>
                    <Button
                      testID="profile-sign-out"
                      modifiers={[
                        buttonStyle("plain"),
                        frame({ maxWidth: Infinity }),
                        background(colors.muted as string),
                        clipShape("capsule"),
                      ]}
                      onPress={() => {
                        haptics.medium();
                        setSignOutConfirm(true);
                      }}
                    >
                      <Text
                        modifiers={[
                          frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
                          multilineTextAlignment("center"),
                          dfont({
                            size: ButtonTokens.fontSize,
                            weight: ButtonTokens.secondaryFontWeight,
                          }),
                          foregroundStyle(colors.destructive as string),
                        ]}
                      >
                        Sign out
                      </Text>
                    </Button>
                  </ConfirmationDialog.Trigger>
                  <ConfirmationDialog.Actions>
                    <Button
                      testID="profile-sign-out-confirm"
                      label="Sign Out"
                      role="destructive"
                      onPress={handleSignOut}
                    />
                    <Button testID="profile-sign-out-cancel" label="Cancel" role="cancel" />
                  </ConfirmationDialog.Actions>
                  <ConfirmationDialog.Message>
                    <Text modifiers={[dfont({ size: 16 })]}>
                      You will need to sign in again to access your account.
                    </Text>
                  </ConfirmationDialog.Message>
                </ConfirmationDialog>

                <Alert
                  title="Delete account?"
                  isPresented={deleteAccountConfirm}
                  onIsPresentedChange={setDeleteAccountConfirm}
                >
                  <Alert.Trigger>
                    <Button
                      testID="profile-delete-account"
                      modifiers={[
                        buttonStyle("plain"),
                        frame({ maxWidth: Infinity }),
                        clipShape("capsule"),
                      ]}
                      onPress={() => {
                        haptics.warning();
                        setDeleteAccountConfirm(true);
                      }}
                    >
                      <Text
                        modifiers={[
                          frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
                          multilineTextAlignment("center"),
                          dfont({
                            size: ButtonTokens.fontSize,
                            weight: ButtonTokens.secondaryFontWeight,
                          }),
                          foregroundStyle(colors.destructive as string),
                        ]}
                      >
                        Delete account
                      </Text>
                    </Button>
                  </Alert.Trigger>
                  <Alert.Actions>
                    <Button
                      testID="profile-delete-account-confirm"
                      label="Delete Account"
                      role="destructive"
                      onPress={deleteAccount}
                    />
                    <Button testID="profile-delete-account-cancel" label="Cancel" role="cancel" />
                  </Alert.Actions>
                  <Alert.Message>
                    <Text modifiers={[dfont({ size: 16 })]}>
                      Your account is scheduled for permanent deletion in 30 days. Sign in within
                      that window to restore it.
                    </Text>
                  </Alert.Message>
                </Alert>
              </>
            )}
          </VStack>
        </ScrollView>
      </Host>
    </>
  );
}

function AvatarView({ avatarUrl, loading }: { avatarUrl: string | null; loading: boolean }) {
  const colors = useColors();
  if (loading) {
    return (
      <VStack
        alignment="center"
        modifiers={[frame({ width: AVATAR_SIZE, height: AVATAR_SIZE }), clipShape("circle")]}
      >
        <ProgressView
          modifiers={[progressViewStyle("circular"), accessibilityLabel("Updating profile photo")]}
        />
      </VStack>
    );
  }
  if (avatarUrl) {
    return <RemoteAvatar key={avatarUrl} url={avatarUrl} size={AVATAR_SIZE} />;
  }
  return (
    <Image
      systemName="person.crop.circle.fill"
      size={AVATAR_SIZE}
      color={colors.mutedForeground as string}
      modifiers={[frame({ width: AVATAR_SIZE, height: AVATAR_SIZE }), accessibilityHidden(true)]}
    />
  );
}

function RemoteAvatar({ url, size }: { url: string; size: number }) {
  const colors = useColors();
  const image = useImage(url, { maxWidth: size * 4 });
  if (!image) {
    return (
      <Image
        systemName="person.crop.circle.fill"
        size={size}
        color={colors.mutedForeground as string}
        modifiers={[frame({ width: size, height: size }), accessibilityHidden(true)]}
      />
    );
  }
  return (
    <RNHostView matchContents>
      <ExpoImage
        source={image}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        accessibilityLabel="Profile photo"
      />
    </RNHostView>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
