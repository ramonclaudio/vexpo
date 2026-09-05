import { useEffect, useRef, useState } from "react";
import {
  Button,
  HStack,
  Image,
  SecureField,
  type SecureFieldRef,
  TextField,
  type TextFieldRef,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  accessibilityHidden,
  accessibilityHint,
  accessibilityInputLabels,
  accessibilityLabel,
  autocorrectionDisabled,
  background,
  buttonStyle,
  clipShape,
  contentShape,
  disabled as disabledMod,
  dynamicTypeSize,
  frame,
  onSubmit as onSubmitMod,
  padding,
  shapes,
  submitLabel,
  textContentType,
  textFieldStyle,
  textInputAutocapitalization,
} from "@expo/ui/swift-ui/modifiers";

import { Button as ButtonTokens } from "@/constants/layout";
import { DynamicType } from "@/constants/ui";
import { useColors } from "@/hooks/use-theme";
import { useDynamicFont } from "@/lib/dynamic-font";
import { haptics } from "@/lib/haptics";

type SubmitLabel = "next" | "done" | "send" | "go" | "search" | "join" | "route" | "continue";
type ContentType = "password" | "newPassword";

type Props = {
  placeholder?: string;
  onTextChange: (next: string) => void;
  onSubmit?: () => void;
  submitLabelType?: SubmitLabel;
  contentType?: ContentType;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

export function PasswordField({
  placeholder = "••••••••",
  onTextChange,
  onSubmit,
  submitLabelType = "done",
  contentType = "password",
  disabled = false,
  accessibilityLabel: a11yLabel = "Password",
  accessibilityHint: a11yHint = "Enter your password",
  testID,
}: Props) {
  const dfont = useDynamicFont();
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const state = useNativeState("");
  const textRef = useRef<TextFieldRef>(null);
  const secureRef = useRef<SecureFieldRef>(null);
  const focused = useRef(false);
  const pendingRefocus = useRef(false);
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    if (!pendingRefocus.current) return;
    pendingRefocus.current = false;
    (visible ? textRef.current : secureRef.current)?.focus();
  }, [visible]);

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
        frame({ maxWidth: Infinity, minHeight: ButtonTokens.height }),
        background(colors.muted as string),
        clipShape("capsule"),
      ]}
    >
      {visible ? (
        <TextField
          ref={textRef}
          testID={testID}
          text={state}
          placeholder={a11yLabel}
          onTextChange={onTextChange}
          onFocusChange={(f) => {
            focused.current = f;
          }}
          modifiers={fieldModifiers}
        />
      ) : (
        <SecureField
          ref={secureRef}
          testID={testID}
          text={state}
          placeholder={placeholder}
          onTextChange={onTextChange}
          onFocusChange={(f) => {
            focused.current = f;
          }}
          modifiers={fieldModifiers}
        />
      )}
      <Button
        testID={testID ? `${testID}-visibility` : undefined}
        modifiers={[
          buttonStyle("plain"),
          frame({ width: 44, height: 44 }),
          contentShape(shapes.rectangle()),
          disabledMod(disabled),
          accessibilityLabel(visible ? "Hide password" : "Show password"),
          accessibilityHint(visible ? "Tap to mask the password" : "Tap to reveal the password"),
          accessibilityInputLabels(["show password", "hide password"]),
        ]}
        onPress={() => {
          haptics.selection();
          pendingRefocus.current = focused.current;
          setVisible((v) => !v);
        }}
      >
        <Image
          systemName={visible ? "eye.slash" : "eye"}
          color={colors.mutedForeground as string}
          modifiers={[
            dfont({ size: 18 }),
            dynamicTypeSize({ max: DynamicType.control }),
            accessibilityHidden(true),
          ]}
        />
      </Button>
    </HStack>
  );
}
