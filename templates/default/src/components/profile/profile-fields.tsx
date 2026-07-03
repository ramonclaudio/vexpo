import { type ComponentProps } from "react";
import { Text, TextField, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityElement,
  accessibilityHint,
  accessibilityLabel,
  autocorrectionDisabled,
  background,
  cornerRadius,
  disabled,
  foregroundStyle,
  frame,
  keyboardType,
  lineLimit,
  padding,
  privacySensitive,
  submitLabel,
  textContentType,
  textFieldStyle,
  textInputAutocapitalization,
} from "@expo/ui/swift-ui/modifiers";
import { runOnJS } from "react-native-worklets";

import { CapsuleTextField } from "@/components/ui/capsule-text-field";
import { HelperText } from "@/components/ui/helper-text";
import { ProminentButton } from "@/components/ui/prominent-button";
import { useColors } from "@/hooks/use-theme";
import { maskUsername } from "@/lib/masks";
import { useDynamicFont } from "@/lib/dynamic-font";

type FieldState = ComponentProps<typeof CapsuleTextField>["text"];

export function ProfileFields({
  nameState,
  usernameState,
  emailState,
  bioState,
  onNameChange,
  onUsernameChange,
  onEmailChange,
  onBioChange,
  isSaving,
  emailFeatures,
  createdAt,
  hasChanges,
  onSave,
}: {
  nameState: FieldState;
  usernameState: FieldState;
  emailState: FieldState;
  bioState: FieldState;
  onNameChange: (v: string) => void;
  onUsernameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onBioChange: (v: string) => void;
  isSaving: boolean;
  emailFeatures: boolean;
  createdAt: number;
  hasChanges: boolean;
  onSave: () => void;
}) {
  const dfont = useDynamicFont();
  const colors = useColors();
  const labelModifiers = [dfont({ size: 17, weight: "semibold" })];

  return (
    <>
      <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
        <Text modifiers={labelModifiers}>Name</Text>
        <CapsuleTextField
          testID="profile-name"
          text={nameState}
          placeholder="Name"
          onTextChange={onNameChange}
          modifiers={[
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
        <CapsuleTextField
          testID="profile-username"
          text={usernameState}
          placeholder="johndoe"
          onTextChange={(text) => {
            "worklet";
            const next = maskUsername(text);
            if (usernameState) usernameState.value = next;
            runOnJS(onUsernameChange)(next);
          }}
          modifiers={[
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
        <HelperText>Name and username are visible to other users.</HelperText>
      </VStack>

      <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
        <Text modifiers={labelModifiers}>Email</Text>
        <CapsuleTextField
          testID="profile-email"
          text={emailState}
          placeholder="you@example.com"
          onTextChange={onEmailChange}
          modifiers={[
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
        <HelperText>
          {emailFeatures
            ? "Changing your email requires verifying the new address with a 6-digit code."
            : "Email change requires Resend setup. Run `npx vexpo full` to enable."}
        </HelperText>
      </VStack>

      <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
        <Text modifiers={labelModifiers}>Bio</Text>
        <TextField
          testID="profile-bio"
          text={bioState}
          placeholder="Tell others about yourself"
          onTextChange={onBioChange}
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
        <HelperText>Up to 500 characters. Visible on your public profile.</HelperText>
      </VStack>

      <VStack
        testID="profile-member-since"
        spacing={6}
        alignment="leading"
        modifiers={[frame({ maxWidth: Infinity }), accessibilityElement("combine")]}
      >
        <Text modifiers={labelModifiers}>Member since</Text>
        <Text modifiers={[dfont({ size: 16 }), foregroundStyle(colors.mutedForeground as string)]}>
          {formatDate(createdAt)}
        </Text>
      </VStack>

      {hasChanges ? (
        <ProminentButton
          testID="profile-save"
          label={isSaving ? "Saving..." : "Save changes"}
          onPress={onSave}
          disabled={isSaving}
        />
      ) : null}
    </>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
