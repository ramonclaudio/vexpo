import { startTransition, useActionState, useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { useDeleteAccount } from "@/hooks/use-delete-account";
import { Stack } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { Host, ScrollView, VStack, useNativeState } from "@expo/ui/swift-ui";
import {
  defaultScrollAnchorForRole,
  padding,
  scrollDismissesKeyboard,
  tint,
} from "@expo/ui/swift-ui/modifiers";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { haptics } from "@/lib/haptics";
import { setNativeValue } from "@/lib/native-state";
import {
  firstError,
  profileUpdateOptionalUsernameSchema,
  profileUpdateSchema,
} from "@/lib/schemas";
import { validateBio } from "@/convex/validators";
import { useColors } from "@/hooks/use-theme";
import { useScenePrivacy } from "@/hooks/use-scene-privacy";
import { useSignOut } from "@/hooks/use-sign-out";
import { ErrorText, SuccessText } from "@/components/ui/status-text";
import { formatError } from "@/lib/convex-error";
import { SkeletonProfile } from "@/components/ui/skeleton";
import { AvatarPickerRow } from "@/components/profile/avatar-picker-row";
import { DangerZone } from "@/components/profile/danger-zone";
import { EmailOtpVerify } from "@/components/profile/email-otp-verify";
import { ProfileFields } from "@/components/profile/profile-fields";
import { announce } from "@/lib/a11y";

type SaveState = { error?: string; success?: string; pendingEmail?: string; attempt?: number };
type OtpState = { error?: string; success?: string; attempt?: number };

export default function ProfileScreen() {
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
  const { deleteAccount, deleteError } = useDeleteAccount();
  const handleSignOut = useSignOut();

  // SwiftUI source of truth via useNativeState; mirrored to React state via
  // onTextChange so derived values like `hasChanges` stay reactive. Username
  // and the email-OTP field add a "worklet" onTextChange so the mask
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
      bio.trim() !== (me.bio ?? ""));

  const [saveState, save, isSaving] = useActionState<SaveState, void>(async (prev) => {
    const attempt = (prev.attempt ?? 0) + 1;
    if (!me) return { error: "Not loaded", attempt };
    haptics.light();

    // Accounts without a username must still save name/email/bio; the strict
    // schema would reject the empty username field they never set.
    const schema = me.username ? profileUpdateSchema : profileUpdateOptionalUsernameSchema;
    const parsed = schema.safeParse({ name, username, email });
    if (!parsed.success) {
      haptics.error();
      return { error: firstError(parsed)!, attempt };
    }

    const trimmedBio = bio.trim();
    const bioCheck = validateBio(trimmedBio);
    if (!bioCheck.valid) {
      haptics.error();
      return { error: bioCheck.error!, attempt };
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
          return { error: res.error.message ?? "Failed to update profile", attempt };
        }
      }

      if (bioChanged) {
        await updateProfile({ bio: trimmedBio.length === 0 ? undefined : trimmedBio });
      }

      if (emailChanged) {
        const res = await authClient.changeEmail({ newEmail: nextEmail });
        if (res.error) {
          haptics.error();
          return { error: res.error.message ?? "Failed to update email", attempt };
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
      return { error: formatError(err), attempt };
    }
  }, {} as SaveState);

  const [otpState, verifyOtp, isVerifying] = useActionState<OtpState, void>(async (prev) => {
    const attempt = (prev.attempt ?? 0) + 1;
    haptics.light();
    // Read the native field, not the JS `otp` mirror: submitting via the
    // keyboard "done" key on the same frame the sixth digit lands can see a
    // stale five-char `otp` because `runOnJS(setOtp)` trails a frame behind.
    const code = otpCodeState.value;
    if (!pendingEmail || code.length !== 6) {
      haptics.error();
      return { error: "Enter the 6-digit code", attempt };
    }
    try {
      const res = await authClient.emailOtp.verifyEmail({ email: pendingEmail, otp: code });
      if (res.error) {
        haptics.error();
        return { error: "Invalid or expired code", attempt };
      }
      haptics.success();
      announce("Email updated");
      setPendingEmail(null);
      setOtp("");
      return { success: "Email updated" };
    } catch {
      haptics.error();
      return { error: "Verification failed", attempt };
    }
  }, {} as OtpState);

  const [avatarUpdating, setAvatarUpdating] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const pickAvatar = async (source: "library" | "camera") => {
    haptics.light();
    setAvatarPicker(false);
    // Let the avatar picker sheet finish dismissing before presenting the
    // image picker. iOS drops a present that starts while a sheet is animating out.
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

  const error = saveState.error ?? otpState.error ?? avatarError ?? deleteError;
  const success = saveState.success ?? otpState.success;

  if (!me) {
    return (
      <Host testID="profile-loading" style={{ flex: 1, backgroundColor: colors.background }}>
        <SkeletonProfile testID="profile-skeleton" />
      </Host>
    );
  }

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
            <AvatarPickerRow
              me={me}
              avatarPicker={avatarPicker}
              setAvatarPicker={setAvatarPicker}
              avatarUpdating={avatarUpdating}
              onPick={pickAvatar}
              onRemove={removeAvatar}
            />

            {error ? (
              <ErrorText
                testID="profile-error"
                attempt={(saveState.attempt ?? 0) + (otpState.attempt ?? 0)}
              >
                {error}
              </ErrorText>
            ) : null}
            {success && !pendingEmail ? (
              <SuccessText testID="profile-success">{success}</SuccessText>
            ) : null}

            {pendingEmail ? (
              <EmailOtpVerify
                pendingEmail={pendingEmail}
                code={otp}
                codeState={otpCodeState}
                onCodeChange={setOtp}
                onVerify={() => startTransition(() => verifyOtp())}
                onCancel={() => {
                  haptics.light();
                  setPendingEmail(null);
                  setOtp("");
                }}
                isVerifying={isVerifying}
              />
            ) : (
              <>
                <ProfileFields
                  nameState={nameState}
                  usernameState={usernameState}
                  emailState={emailState}
                  bioState={bioState}
                  onNameChange={setName}
                  onUsernameChange={setUsername}
                  onEmailChange={setEmail}
                  onBioChange={setBio}
                  isSaving={isSaving}
                  emailFeatures={emailFeatures}
                  createdAt={me.createdAt}
                  hasChanges={hasChanges}
                  onSave={() => startTransition(() => save())}
                />

                <DangerZone
                  hasPassword={hasPasswordResult}
                  signOutConfirm={signOutConfirm}
                  setSignOutConfirm={setSignOutConfirm}
                  deleteAccountConfirm={deleteAccountConfirm}
                  setDeleteAccountConfirm={setDeleteAccountConfirm}
                  onSignOut={handleSignOut}
                  onDeleteAccount={deleteAccount}
                />
              </>
            )}
          </VStack>
        </ScrollView>
      </Host>
    </>
  );
}
