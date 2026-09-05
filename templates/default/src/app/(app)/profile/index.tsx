import { startTransition, useActionState, useEffect, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { useDeleteAccount } from "@/hooks/use-delete-account";
import { Stack, router } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
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
  guestProfileSchema,
  profileUpdateOptionalUsernameSchema,
  profileUpdateSchema,
} from "@/lib/schemas";
import { validateBio } from "@/convex/validators";
import { useAuthStatus } from "@/hooks/use-auth-status";
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
import { SecondaryButton } from "@/components/ui/capsule-button";
import { fail, succeed } from "@/lib/form-result";

type SaveState = { error?: string; success?: string; pendingEmail?: string; attempt?: number };
type OtpState = { error?: string; success?: string; attempt?: number };

type EditableProfile = {
  name: string;
  username?: string | null;
  email: string;
  bio?: string | null;
};

type FieldValues = { name: string; username: string; email: string; bio: string };

function fieldValues(me: EditableProfile | null | undefined): FieldValues {
  return {
    name: me?.name ?? "",
    username: me?.username ?? "",
    email: me?.email ?? "",
    bio: me?.bio ?? "",
  };
}

// Each field is edited natively and mirrored into React state so validation can
// read it. `set` writes both, which is the only way they stay in agreement.
function useField(initial: string) {
  const native = useNativeState(initial);
  const [value, setValue] = useState(initial);
  return {
    native,
    value,
    set: (next: string) => {
      setNativeValue(native, next);
      setValue(next);
    },
    setValue,
  };
}

const FIELD_KEYS = ["name", "username", "email", "bio"] as const;

function useProfileFields(
  me: (EditableProfile & { _id: string; updatedAt: number }) | null | undefined,
) {
  const initial = fieldValues(me);
  const fields = {
    name: useField(initial.name),
    username: useField(initial.username),
    email: useField(initial.email),
    bio: useField(initial.bio),
  };

  const currentKey = me ? `${me._id}:${me.updatedAt}` : null;
  useEffect(() => {
    if (!me) return;
    const next = fieldValues(me);
    for (const key of FIELD_KEYS) fields[key].set(next[key]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);

  return fields;
}

// Returns the trimmed bio to save, or the state to hand straight back to the form.
function checkBio(bio: string, attempt: number): { bio: string } | { error: string } {
  const trimmed = bio.trim();
  const check = validateBio(trimmed);
  return check.valid ? { bio: trimmed } : fail(check.error!, attempt);
}

function hasProfileChanges(
  me: EditableProfile | null | undefined,
  v: FieldValues,
  isGuest: boolean,
): boolean {
  if (!me) return false;
  const nameOrBioChanged = v.name.trim() !== me.name || v.bio.trim() !== (me.bio ?? "");
  if (isGuest) return nameOrBioChanged;
  return (
    nameOrBioChanged ||
    v.username.trim().toLowerCase() !== (me.username ?? "") ||
    v.email.trim().toLowerCase() !== me.email.toLowerCase()
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const scenePrivacy = useScenePrivacy();
  const me = useQuery(api.users.getMe);
  const { isGuest } = useAuthStatus();
  const hasPasswordResult = useQuery(api.auth.hasPassword, isGuest ? "skip" : {});
  const providers = useQuery(api.auth.getEnabledProviders);
  const emailFeatures = providers?.emailFeatures === true;
  const updateProfile = useMutation(api.users.updateProfile);
  const generateAvatarUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const updateAvatar = useMutation(api.users.updateAvatar);
  const deleteAvatar = useMutation(api.users.deleteAvatar);
  const { deleteAccount, deleteError } = useDeleteAccount();
  const handleSignOut = useSignOut();

  const fields = useProfileFields(me);
  const values: FieldValues = {
    name: fields.name.value,
    username: fields.username.value,
    email: fields.email.value,
    bio: fields.bio.value,
  };
  const { name, username, email, bio } = values;

  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const otpCodeState = useNativeState("");
  const [otp, setOtp] = useState("");
  const [avatarPicker, setAvatarPicker] = useState(false);
  const [signOutConfirm, setSignOutConfirm] = useState(false);
  const [deleteAccountConfirm, setDeleteAccountConfirm] = useState(false);
  const hasChanges = hasProfileChanges(me, values, isGuest);

  const saveGuest = async (
    current: NonNullable<typeof me>,
    attempt: number,
  ): Promise<SaveState> => {
    const nextName = name.trim();
    const parsed = guestProfileSchema.safeParse({ name: nextName });
    if (!parsed.success) {
      return fail(firstError(parsed)!, attempt);
    }

    const checked = checkBio(bio, attempt);
    if ("error" in checked) return checked;
    const trimmedBio = checked.bio;

    try {
      if (nextName !== current.name) {
        const res = await authClient.updateUser({ name: parsed.data.name });
        if (res.error) {
          return fail(res.error.message ?? "Failed to update profile", attempt);
        }
      }
      if (trimmedBio !== (current.bio ?? "")) {
        await updateProfile({ bio: trimmedBio.length === 0 ? undefined : trimmedBio });
      }
      succeed("Profile saved");
      return { success: "Saved" };
    } catch (err) {
      return fail(formatError(err), attempt);
    }
  };

  const saveIdentity = async (updates: Record<string, string>): Promise<string | null> => {
    const res = await authClient.updateUser(updates);
    return res.error ? (res.error.message ?? "Failed to update profile") : null;
  };

  const saveAccount = async (
    current: NonNullable<typeof me>,
    attempt: number,
  ): Promise<SaveState> => {
    const schema = current.username ? profileUpdateSchema : profileUpdateOptionalUsernameSchema;
    const parsed = schema.safeParse({ name, username, email });
    if (!parsed.success) {
      return fail(firstError(parsed)!, attempt);
    }

    const checked = checkBio(bio, attempt);
    if ("error" in checked) return checked;
    const trimmedBio = checked.bio;

    const { name: nextName, username: nextUsername, email: nextEmail } = parsed.data;
    const identity: Record<string, string> = {};
    if (nextName !== current.name) identity.name = nextName;
    if (nextUsername !== (current.username ?? "")) identity.username = nextUsername;

    try {
      if (Object.keys(identity).length > 0) {
        const failed = await saveIdentity(identity);
        if (failed) {
          return fail(failed, attempt);
        }
      }

      if (trimmedBio !== (current.bio ?? "")) {
        await updateProfile({ bio: trimmedBio.length === 0 ? undefined : trimmedBio });
      }

      if (nextEmail !== current.email.toLowerCase()) {
        const res = await authClient.changeEmail({ newEmail: nextEmail });
        if (res.error) {
          return fail(res.error.message ?? "Failed to update email", attempt);
        }
        haptics.success();
        setPendingEmail(nextEmail);
        setOtp("");
        return { pendingEmail: nextEmail };
      }

      succeed("Profile saved");
      return { success: "Saved" };
    } catch (err) {
      return fail(formatError(err), attempt);
    }
  };

  const [saveState, save, isSaving] = useActionState<SaveState, void>(async (prev) => {
    const attempt = (prev.attempt ?? 0) + 1;
    if (!me) return { error: "Not loaded", attempt };
    return isGuest ? await saveGuest(me, attempt) : await saveAccount(me, attempt);
  }, {} as SaveState);

  const [otpState, verifyOtp, isVerifying] = useActionState<OtpState, void>(async (prev) => {
    const attempt = (prev.attempt ?? 0) + 1;
    const code = otpCodeState.value;
    if (!pendingEmail || code.length !== 6) {
      return fail("Enter the 6-digit code", attempt);
    }
    try {
      const res = await authClient.emailOtp.verifyEmail({ email: pendingEmail, otp: code });
      if (res.error) {
        return fail("Invalid or expired code", attempt);
      }
      succeed("Email updated");
      setPendingEmail(null);
      setOtp("");
      return { success: "Email updated" };
    } catch {
      return fail("Verification failed", attempt);
    }
  }, {} as OtpState);

  const [avatarUpdating, setAvatarUpdating] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Both avatar mutations set the same three pieces of state around the work.
  const runAvatarTask = async (task: () => Promise<void>) => {
    try {
      setAvatarError(null);
      setAvatarUpdating(true);
      await task();
    } catch (err) {
      haptics.error();
      setAvatarError(formatError(err));
    } finally {
      setAvatarUpdating(false);
    }
  };

  const pickAvatar = async (source: "library" | "camera") => {
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

    await runAvatarTask(async () => {
      const uploadUrl = await generateAvatarUploadUrl();
      const read = await fetch(asset.uri);
      if (!read.ok) {
        throw new ConvexError({ message: "Couldn't read that photo. Please try another one." });
      }
      const upload = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": asset.mimeType ?? "image/jpeg" },
        body: await read.arrayBuffer(),
      });
      if (!upload.ok) {
        throw new ConvexError({ message: "Couldn't upload that photo. Please try another one." });
      }
      const { storageId } = (await upload.json()) as { storageId: string };
      await updateAvatar({ storageId: storageId as never });
      succeed("Profile photo updated");
    });
  };

  const removeAvatar = async () => {
    setAvatarPicker(false);
    haptics.medium();
    await runAvatarTask(async () => {
      await deleteAvatar();
      succeed("Profile photo removed");
    });
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
        modifiers={scenePrivacy}
      >
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
            modifiers={[padding({ horizontal: 24, top: 24, bottom: 40 })]}
          >
            <AvatarPickerRow
              me={me}
              isGuest={isGuest}
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
                  setPendingEmail(null);
                  setOtp("");
                }}
                isVerifying={isVerifying}
                invalidCode={!!otpState.error}
              />
            ) : (
              <>
                <ProfileFields
                  nameState={fields.name.native}
                  usernameState={fields.username.native}
                  emailState={fields.email.native}
                  bioState={fields.bio.native}
                  onNameChange={fields.name.setValue}
                  onUsernameChange={fields.username.setValue}
                  onEmailChange={fields.email.setValue}
                  onBioChange={fields.bio.setValue}
                  isSaving={isSaving}
                  emailFeatures={emailFeatures}
                  isGuest={isGuest}
                  createdAt={me.createdAt}
                  hasChanges={hasChanges}
                  onSave={() => startTransition(() => save())}
                />

                {isGuest ? (
                  <SecondaryButton
                    testID="profile-create-account"
                    label="Create an account"
                    onPress={() => router.push("/auth/sign-up")}
                    inputLabels={["Create an account", "Sign up"]}
                  />
                ) : (
                  <DangerZone
                    hasPassword={hasPasswordResult}
                    signOutConfirm={signOutConfirm}
                    setSignOutConfirm={setSignOutConfirm}
                    deleteAccountConfirm={deleteAccountConfirm}
                    setDeleteAccountConfirm={setDeleteAccountConfirm}
                    onSignOut={handleSignOut}
                    onDeleteAccount={deleteAccount}
                  />
                )}
              </>
            )}
          </VStack>
        </ScrollView>
      </Host>
    </>
  );
}
