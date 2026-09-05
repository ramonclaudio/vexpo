import { type ComponentProps } from "react";
import { Button, VStack } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  contentShape,
  disabled,
  foregroundStyle,
  frame,
  shapes,
} from "@expo/ui/swift-ui/modifiers";

import { CapsuleTextField } from "@/components/ui/capsule-text-field";
import { HelperText } from "@/components/ui/helper-text";
import { LabeledField } from "@/components/ui/labeled-field";
import { OtpField } from "@/components/ui/otp-field";
import { ProminentButton } from "@/components/ui/capsule-button";
import { TouchTarget } from "@/constants/layout";
import { useColors } from "@/hooks/use-theme";
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
  invalidCode,
}: {
  pendingEmail: string;
  code: string;
  codeState: CodeState;
  onCodeChange: (digits: string) => void;
  onVerify: () => void;
  onCancel: () => void;
  isVerifying: boolean;
  invalidCode: boolean;
}) {
  const dfont = useDynamicFont();
  const colors = useColors();
  return (
    <>
      <LabeledField label="Verify new email">
        <OtpField
          testID="profile-email-otp"
          text={codeState}
          hint="Enter the 6 digit code sent to your new email"
          onChange={onCodeChange}
          onVerify={onVerify}
          isVerifying={isVerifying}
          invalidCode={invalidCode}
        />
        <HelperText testID="profile-email-otp-sent">
          {`A 6-digit code was sent to ${pendingEmail}.`}
        </HelperText>
      </LabeledField>

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
            foregroundStyle(colors.mutedForeground),
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
