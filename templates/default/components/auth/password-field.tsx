import { type ComponentProps, useState } from "react";
import { Button, HStack, Image, SecureField, TextField, useNativeState } from "@expo/ui/swift-ui";
import {
  accessibilityHint,
  accessibilityLabel,
  autocorrectionDisabled,
  background,
  buttonStyle,
  clipShape,
  disabled as disabledMod,
  frame,
  onSubmit as onSubmitMod,
  padding,
  submitLabel,
  textContentType,
  textFieldStyle,
  textInputAutocapitalization,
} from "@expo/ui/swift-ui/modifiers";

import { Button as ButtonTokens } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";
import { useDynamicFont } from "@/lib/dynamic-font";
import { haptics } from "@/lib/haptics";

type ObservableTextState = NonNullable<ComponentProps<typeof TextField>["text"]>;
type SubmitLabel = "next" | "done" | "send" | "go" | "search" | "join" | "route" | "continue";
type ContentType = "password" | "newPassword";

type Props = {
  text?: ObservableTextState;
  placeholder?: string;
  onTextChange: (next: string) => void;
  onSubmit?: () => void;
  submitLabelType?: SubmitLabel;
  /**
   * iOS text content type. `"password"` (default) hooks into keychain
   * autofill for existing credentials. `"newPassword"` triggers Strong
   * Password generation and saves the new credential on success. Use it
   * for the sign-up and reset flows.
   */
  contentType?: ContentType;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/**
 * Password input with an inline eye toggle to reveal what was typed.
 *
 * The toggle swaps between SecureField (masked) and TextField (visible). Both
 * are bound to the same `useNativeState`, so the native value persists across
 * the swap. without it, React unmounts one component and mounts the other
 * and the new field starts empty. If the parent passes its own ObservableState
 * via `text`, that's used instead (e.g. profile.tsx clears the field after
 * submit by resetting the state from outside).
 */
export function PasswordField({
  text,
  placeholder = "••••••••",
  onTextChange,
  onSubmit,
  submitLabelType = "done",
  contentType = "password",
  disabled = false,
  accessibilityLabel: a11yLabel = "Password",
  accessibilityHint: a11yHint = "Enter your password",
}: Props) {
  const dfont = useDynamicFont();
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const internalState = useNativeState("");
  const sharedState = text ?? internalState;

  const fieldModifiers = [
    textFieldStyle("plain"),
    frame({ maxWidth: Infinity }),
    dfont({ size: 16 }),
    autocorrectionDisabled(),
    textInputAutocapitalization("never"),
    textContentType(contentType),
    disabledMod(disabled),
    submitLabel(submitLabelType),
    accessibilityLabel(a11yLabel),
    accessibilityHint(a11yHint),
    ...(onSubmit ? [onSubmitMod(onSubmit)] : []),
  ];

  return (
    <HStack
      spacing={8}
      modifiers={[
        padding({ horizontal: 16 }),
        frame({ maxWidth: Infinity, height: ButtonTokens.height }),
        background(colors.muted as string),
        clipShape("capsule"),
      ]}
    >
      {visible ? (
        <TextField
          text={sharedState}
          placeholder={placeholder}
          onTextChange={onTextChange}
          modifiers={fieldModifiers}
        />
      ) : (
        <SecureField
          text={sharedState}
          placeholder={placeholder}
          onTextChange={onTextChange}
          modifiers={fieldModifiers}
        />
      )}
      <Button
        modifiers={[
          buttonStyle("plain"),
          accessibilityLabel(visible ? "Hide password" : "Show password"),
          accessibilityHint(visible ? "Tap to mask the password" : "Tap to reveal the password"),
        ]}
        onPress={() => {
          haptics.light();
          setVisible((v) => !v);
        }}
      >
        <Image
          systemName={visible ? "eye.slash" : "eye"}
          size={18}
          color={colors.mutedForeground as string}
        />
      </Button>
    </HStack>
  );
}
