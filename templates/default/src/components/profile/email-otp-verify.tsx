import { type ComponentProps } from "react";
import { Button, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityHint,
  accessibilityLabel,
  buttonStyle,
  contentShape,
  disabled,
  dynamicTypeSize,
  foregroundStyle,
  frame,
  kerning,
  keyboardType,
  monospacedDigit,
  multilineTextAlignment,
  onSubmit,
  shapes,
  submitLabel,
  textContentType,
} from "@expo/ui/swift-ui/modifiers";
import { runOnJS } from "react-native-worklets";

import { CapsuleTextField } from "@/components/ui/capsule-text-field";
import { HelperText } from "@/components/ui/helper-text";
import { ProminentButton } from "@/components/ui/prominent-button";
import { TouchTarget } from "@/constants/layout";
import { DynamicType } from "@/constants/ui";
import { useColors } from "@/hooks/use-theme";
import { maskOtp } from "@/lib/masks";
import { useDynamicFont } from "@/lib/dynamic-font";

type CodeState = ComponentProps<typeof CapsuleTextField>["text"];

export function EmailOtpVerify({
  pendingEmail,
  code,
  codeState,
  onCodeChange,
  onVerify,
  onCancel,
  isVerifying,
}: {
  pendingEmail: string;
  code: string;
  codeState: CodeState;
  onCodeChange: (digits: string) => void;
  onVerify: () => void;
  onCancel: () => void;
  isVerifying: boolean;
}) {
  const dfont = useDynamicFont();
  const colors = useColors();
  return (
    <>
      <VStack spacing={6} alignment="leading" modifiers={[frame({ maxWidth: Infinity })]}>
        <Text modifiers={[dfont({ size: 17, weight: "semibold" })]}>Verify new email</Text>
        <CapsuleTextField
          testID="profile-email-otp"
          text={codeState}
          placeholder="000000"
          onTextChange={(text) => {
            "worklet";
            const digits = maskOtp(text);
            if (codeState) codeState.value = digits;
            runOnJS(onCodeChange)(digits);
          }}
          autoFocus
          modifiers={[
            keyboardType("numeric"),
            textContentType("oneTimeCode"),
            onSubmit(onVerify),
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
        <HelperText testID="profile-email-otp-sent">
          {`A 6-digit code was sent to ${pendingEmail}.`}
        </HelperText>
      </VStack>

      <ProminentButton
        testID="profile-email-verify"
        label={isVerifying ? "Verifying..." : "Verify"}
        onPress={onVerify}
        disabled={isVerifying || code.length !== 6}
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
          onPress={onCancel}
        />
      </VStack>
    </>
  );
}
