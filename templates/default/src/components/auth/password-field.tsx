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
  accessibilityHint,
  accessibilityLabel,
  autocorrectionDisabled,
  background,
  buttonStyle,
  clipShape,
  contentShape,
  disabled as disabledMod,
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
import { useColors } from "@/hooks/use-theme";
import { useDynamicFont } from "@/lib/dynamic-font";
import { useSymbolSize } from "@/lib/dynamic-symbol-size";
import { haptics } from "@/lib/haptics";

type SubmitLabel = "next" | "done" | "send" | "go" | "search" | "join" | "route" | "continue";
type ContentType = "password" | "newPassword";

type Props = {
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
 * The toggle swaps between SecureField (masked) and TextField (visible), two
 * different native views. Both bind to the same `useNativeState`, so the native
 * value survives the swap. Without it, React unmounts one and mounts the other
 * and the new field starts empty.
 */
export function PasswordField({
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
  const symbolSize = useSymbolSize();
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const state = useNativeState("");
  const textRef = useRef<TextFieldRef>(null);
  const secureRef = useRef<SecureFieldRef>(null);
  const focused = useRef(false);
  const pendingRefocus = useRef(false);
  const didMount = useRef(false);

  // The eye toggle swaps SecureField <-> TextField, two different native views.
  // React unmounts the focused one and mounts the other, so iOS drops the
  // keyboard and caret. When the field was focused at the tap, refocus the
  // now-active field after the swap so typing isn't interrupted.
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
        modifiers={[
          buttonStyle("plain"),
          frame({ width: 44, height: 44 }),
          contentShape(shapes.rectangle()),
          disabledMod(disabled),
          accessibilityLabel(visible ? "Hide password" : "Show password"),
          accessibilityHint(visible ? "Tap to mask the password" : "Tap to reveal the password"),
        ]}
        onPress={() => {
          haptics.light();
          pendingRefocus.current = focused.current;
          setVisible((v) => !v);
        }}
      >
        <Image
          systemName={visible ? "eye.slash" : "eye"}
          size={symbolSize(18)}
          color={colors.mutedForeground as string}
        />
      </Button>
    </HStack>
  );
}
