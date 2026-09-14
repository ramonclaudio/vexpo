import { Text, TextField } from "@expo/ui/swift-ui";
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
import { scheduleOnRN } from "react-native-worklets";

import { CapsuleTextField, type TextFieldState } from "@/components/ui/capsule-text-field";
import { HelperText } from "@/components/ui/helper-text";
import { ProminentButton } from "@/components/ui/capsule-button";
import { LabeledField } from "@/components/ui/labeled-field";
import { Colors } from "@/constants/theme";
import { BIO_MAX_LENGTH } from "@/convex/constants";
import { maskUsername } from "@/lib/masks";
import { useDynamicFont } from "@/lib/dynamic-font";

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
  isGuest,
  createdAt,
  hasChanges,
  onSave,
}: {
  nameState: TextFieldState;
  usernameState: TextFieldState;
  emailState: TextFieldState;
  bioState: TextFieldState;
  onNameChange: (v: string) => void;
  onUsernameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onBioChange: (v: string) => void;
  isSaving: boolean;
  emailFeatures: boolean;
  isGuest: boolean;
  createdAt: number;
  hasChanges: boolean;
  onSave: () => void;
}) {
  const dfont = useDynamicFont();

  return (
    <>
      <LabeledField label="Name">
        <CapsuleTextField
          text={nameState}
          placeholder="Name"
          onTextChange={onNameChange}
          modifiers={[
            textInputAutocapitalization("words"),
            textContentType("name"),
            disabled(isSaving),
            submitLabel("next"),
            accessibilityLabel("Name"),
            accessibilityHint("Edit the display name for your account"),
          ]}
        />
      </LabeledField>

      {isGuest ? null : (
        <>
          <LabeledField label="Username">
            <CapsuleTextField
              text={usernameState}
              placeholder="johndoe"
              onTextChange={(text) => {
                "worklet";
                const next = maskUsername(text);
                usernameState.value = next;
                scheduleOnRN(onUsernameChange, next);
              }}
              modifiers={[
                keyboardType("ascii-capable"),
                autocorrectionDisabled(),
                textInputAutocapitalization("never"),
                textContentType("username"),
                disabled(isSaving),
                submitLabel("next"),
                accessibilityLabel("Username"),
                accessibilityHint("Edit the username for your account"),
              ]}
            />
            <HelperText>Name and username are visible to other users.</HelperText>
          </LabeledField>

          <LabeledField label="Email">
            <CapsuleTextField
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
          </LabeledField>
        </>
      )}

      <LabeledField label="Bio">
        <TextField
          text={bioState}
          placeholder="Tell others about yourself"
          onTextChange={onBioChange}
          axis="vertical"
          modifiers={[
            textFieldStyle("plain"),
            padding({ horizontal: 16, vertical: 12 }),
            frame({ maxWidth: Infinity }),
            background(Colors.muted),
            cornerRadius(20),
            dfont({ size: 16 }),
            lineLimit({ min: 1, max: 4 }),
            disabled(isSaving),
            submitLabel("done"),
            accessibilityLabel("Bio"),
            accessibilityHint(`Up to ${BIO_MAX_LENGTH} characters describing yourself`),
          ]}
        />
        <HelperText>
          {isGuest
            ? `Up to ${BIO_MAX_LENGTH} characters. It comes with you when you create an account.`
            : `Up to ${BIO_MAX_LENGTH} characters. Visible on your public profile.`}
        </HelperText>
      </LabeledField>

      <LabeledField
        label={isGuest ? "Browsing since" : "Member since"}
        modifiers={[accessibilityElement("combine")]}
      >
        <Text modifiers={[dfont({ size: 16 }), foregroundStyle(Colors.mutedForeground)]}>
          {formatDate(createdAt)}
        </Text>
      </LabeledField>

      {hasChanges ? (
        <ProminentButton
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
