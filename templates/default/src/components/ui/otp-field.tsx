import { type ComponentProps } from "react";
import {
  accessibilityHint,
  accessibilityLabel,
  disabled,
  dynamicTypeSize,
  kerning,
  keyboardType,
  monospacedDigit,
  multilineTextAlignment,
  onSubmit,
  strokeBorder,
  submitLabel,
  textContentType,
} from "@expo/ui/swift-ui/modifiers";
import { useWindowDimensions } from "react-native";
import { scheduleOnRN } from "react-native-worklets";

import { CapsuleTextField } from "@/components/ui/capsule-text-field";
import { DynamicType, otpKerning } from "@/constants/ui";
import { useColors } from "@/hooks/use-theme";
import { useDynamicFont } from "@/lib/dynamic-font";
import { maskOtp } from "@/lib/masks";

type CodeState = ComponentProps<typeof CapsuleTextField>["text"];

export function OtpField({
  testID,
  text,
  hint,
  onChange,
  onVerify,
  isVerifying,
  invalidCode,
}: {
  testID: string;
  text: CodeState;
  hint: string;
  onChange: (digits: string) => void;
  onVerify: () => void;
  isVerifying: boolean;
  invalidCode: boolean;
}) {
  const dfont = useDynamicFont();
  const colors = useColors();
  const { fontScale } = useWindowDimensions();
  return (
    <CapsuleTextField
      testID={testID}
      text={text}
      placeholder="000000"
      onTextChange={(raw) => {
        "worklet";
        const digits = maskOtp(raw);
        if (text) text.value = digits;
        scheduleOnRN(onChange, digits);
      }}
      autoFocus
      modifiers={[
        dfont({ size: 24, design: "monospaced" }),
        monospacedDigit(),
        kerning(otpKerning(fontScale)),
        multilineTextAlignment("center"),
        dynamicTypeSize({ max: DynamicType.otp }),
        keyboardType("numeric"),
        textContentType("oneTimeCode"),
        onSubmit(onVerify),
        submitLabel("done"),
        disabled(isVerifying),
        accessibilityLabel("Verification code"),
        accessibilityHint(hint),
        ...(invalidCode
          ? [strokeBorder({ color: colors.destructive, shape: "capsule", style: { lineWidth: 2 } })]
          : []),
      ]}
    />
  );
}
