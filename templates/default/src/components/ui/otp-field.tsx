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

import { CapsuleTextField, type TextFieldState } from "@/components/ui/capsule-text-field";
import { DynamicType, otpKerning } from "@/constants/ui";
import { Colors } from "@/constants/theme";
import { useDynamicFont } from "@/lib/dynamic-font";
import { maskOtp } from "@/lib/masks";

export function OtpField({
  text,
  hint,
  onChange,
  onVerify,
  submit = "done",
  isVerifying,
  invalidCode,
}: {
  text: TextFieldState;
  hint: string;
  onChange: (digits: string) => void;
  onVerify?: () => void;
  submit?: Parameters<typeof submitLabel>[0];
  isVerifying: boolean;
  invalidCode: boolean;
}) {
  const dfont = useDynamicFont();
  const { fontScale } = useWindowDimensions();
  return (
    <CapsuleTextField
      text={text}
      placeholder="000000"
      onTextChange={(raw) => {
        "worklet";
        const digits = maskOtp(raw);
        text.value = digits;
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
        ...(onVerify ? [onSubmit(onVerify)] : []),
        submitLabel(submit),
        disabled(isVerifying),
        accessibilityLabel("Verification code"),
        accessibilityHint(hint),
        ...(invalidCode
          ? [strokeBorder({ color: Colors.destructive, shape: "capsule", style: { lineWidth: 2 } })]
          : []),
      ]}
    />
  );
}
